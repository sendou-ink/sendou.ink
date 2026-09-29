import { type Kysely, sql } from "kysely";

// snapshot of the app's ability data and signature logic (BuildRepository's computeAbilitySums/serializeSignature) as of this migration
const STACKABLE_ABILITIES = new Set([
	"ISM",
	"ISS",
	"IRU",
	"RSU",
	"SSU",
	"SCU",
	"SS",
	"SPU",
	"QR",
	"QSJ",
	"BRU",
	"RES",
	"SRU",
	"IA",
]);
const MAIN_SLOT_AP = 10;
const SUB_SLOT_AP = 3;

/** New definitions of legacy columns created without `not null` that every write sets and no row has null in. */
const COLUMN_DEFINITIONS: Record<string, Record<string, string>> = {
	AllTeamMember: {
		isMainTeam: `"isMainTeam" integer not null default 1`,
		isManager: `"isManager" integer not null default 0`,
	},
	Build: {
		abilities: `"abilities" text not null`,
		abilitiesSignature: `"abilitiesSignature" text not null`,
	},
	BuildWeapon: {
		canonicalWeaponSplId: `"canonicalWeaponSplId" integer not null`,
		// was a fixed timestamp from the migration that added it, every write mirrors Build.updatedAt
		updatedAt: `"updatedAt" integer not null`,
	},
	CalendarEvent: { hidden: `"hidden" integer not null default 0` },
	ScrimPost: {
		isScheduledForFuture: `"isScheduledForFuture" integer not null default 1`,
	},
	TournamentMatchGameResultParticipant: {
		tournamentTeamId: `"tournamentTeamId" integer not null`,
	},
	TournamentRound: { maps: `"maps" text not null` },
	TournamentTeam: { droppedOut: `"droppedOut" integer not null default 0` },
	TournamentTeamCheckIn: {
		isCheckOut: `"isCheckOut" integer not null default 0`,
	},
	TrustRelationship: {
		lastUsedAt: `"lastUsedAt" integer not null default 0`,
	},
	User: {
		noScreen: `"noScreen" integer not null default 0`,
		// was `default "NO"`, an identifier SQLite only reads as a string for legacy compatibility
		vc: `"vc" text not null default 'NO'`,
	},
};

/**
 * Adds `not null` to legacy columns that only allowed null because of how they were created, and
 * fixes two odd defaults while at it.
 * `Build.abilitiesSignature` also had real nulls and stale values first recomputed: private builds
 * lack a signature because the column's backfill read the public only `BuildAbilitySum`, and
 * Ability Doubler builds saved before the signature and sums learned to double their subs still
 * carry the undoubled values.
 */
export async function up(db: Kysely<any>): Promise<void> {
	// a no-op inside a transaction, and needed off so dropping the old tables doesn't cascade to their children
	await sql`pragma foreign_keys = off`.execute(db);

	try {
		await db.transaction().execute(async (trx) => {
			await recomputeAbilitySums(trx);

			const viewsAndTriggers = await dropViewsAndTriggers(trx);
			for (const [table, definitions] of Object.entries(COLUMN_DEFINITIONS)) {
				await rebuildWithColumns(trx, table, definitions);
			}
			for (const statement of viewsAndTriggers) {
				await sql.raw(statement).execute(trx);
			}

			const violations = await sql`pragma foreign_key_check`.execute(trx);
			if (violations.rows.length > 0) {
				throw new Error(
					`foreign key check failed: ${JSON.stringify(violations.rows.slice(0, 5))}`,
				);
			}
		});
	} finally {
		await sql`pragma foreign_keys = on`.execute(db);
	}
}

/** Renaming a table fails while any view or trigger refers to a table that doesn't exist, as the old ones briefly don't. */
async function dropViewsAndTriggers(trx: Kysely<any>) {
	const { rows } = await sql<{ type: string; name: string; sql: string }>`
		select "type", "name", "sql" from "sqlite_master"
		where "type" in ('view', 'trigger')
		order by "type" desc
	`.execute(trx);

	for (const { type, name } of rows) {
		await sql.raw(`drop ${type} "${name}"`).execute(trx);
	}

	return rows.map((row) => row.sql);
}

async function rebuildWithColumns(
	trx: Kysely<any>,
	table: string,
	definitions: Record<string, string>,
) {
	const tempName = `${table}__rebuild`;

	const {
		rows: [{ sql: createSql }],
	} = await sql<{ sql: string }>`
		select "sql" from "sqlite_master" where "type" = 'table' and "name" = ${table}
	`.execute(trx);
	const { rows: indexes } = await sql<{ sql: string }>`
		select "sql" from "sqlite_master"
		where "type" = 'index' and "tbl_name" = ${table} and "sql" is not null
	`.execute(trx);
	// generated columns are left out by table_info, they can't be inserted into
	const { rows: columns } = await sql<{ name: string }>`
		select "name" from pragma_table_info(${table})
	`.execute(trx);
	const columnList = columns.map((column) => `"${column.name}"`).join(", ");
	const {
		rows: [sequence],
	} = await sql<{ seq: number }>`
		select "seq" from "sqlite_sequence" where "name" = ${table}
	`.execute(trx);

	await sql
		.raw(createTableSql(table, createSql, tempName, definitions))
		.execute(trx);
	await sql
		.raw(
			`insert into "${tempName}" (${columnList}) select ${columnList} from "${table}"`,
		)
		.execute(trx);
	await sql.raw(`drop table "${table}"`).execute(trx);
	await sql.raw(`alter table "${tempName}" rename to "${table}"`).execute(trx);

	// keeps ids of deleted rows from being reused
	if (sequence) {
		await sql`
			update "sqlite_sequence" set "seq" = cast(${sequence.seq} as integer) where "name" = ${table}
		`.execute(trx);
	}

	for (const index of indexes) {
		await sql.raw(index.sql).execute(trx);
	}
}

function createTableSql(
	name: string,
	original: string,
	tempName: string,
	definitions: Record<string, string>,
) {
	let result = original.replace(
		new RegExp(`^create table "?${name}"?`, "i"),
		`create table "${tempName}"`,
	);
	if (result === original) {
		throw new Error(`${name}: unexpected create table statement`);
	}

	for (const [column, newDefinition] of Object.entries(definitions)) {
		// tables grown by "add column" have their later columns on one line
		const definition = new RegExp(
			`((?:^|[(,])\\s*)"${column}"\\s[^,]*?(\\s*(?:,|$))`,
			"m",
		);
		if (!definition.test(result)) {
			throw new Error(`${name}.${column}: column definition not found`);
		}
		result = result.replace(definition, `$1${newDefinition}$2`);
	}

	return result;
}

async function recomputeAbilitySums(trx: Kysely<any>) {
	const { rows } = await sql<{
		id: number;
		abilities: string;
		abilitiesSignature: string | null;
		isPrivate: number;
	}>`
		select "id", "abilities", "abilitiesSignature", "isPrivate" from "Build"
	`.execute(trx);

	for (const row of rows) {
		const sums = abilitySums(JSON.parse(row.abilities));
		const signature = serializeSignature(sums);
		if (signature === row.abilitiesSignature) continue;

		await sql`
			update "Build" set "abilitiesSignature" = ${signature} where "id" = ${row.id}
		`.execute(trx);

		if (row.isPrivate) continue;

		await sql`delete from "BuildAbilitySum" where "buildId" = ${row.id}`.execute(
			trx,
		);
		await sql`delete from "BuildWeaponAbility" where "buildId" = ${row.id}`.execute(
			trx,
		);
		for (const [ability, abilityPoints] of sums) {
			await sql`
				insert into "BuildAbilitySum" ("buildId", "ability", "abilityPoints")
				values (${row.id}, ${ability}, ${abilityPoints})
			`.execute(trx);
			await sql`
				insert into "BuildWeaponAbility" ("canonicalWeaponSplId", "buildId", "ability", "abilityPoints")
				select "canonicalWeaponSplId", "buildId", ${ability}, ${abilityPoints}
				from "BuildWeapon" where "buildId" = ${row.id}
			`.execute(trx);
		}
	}
}

function abilitySums(abilities: string[][]) {
	const sums = new Map<string, number>();
	const add = (ability: string, ap: number) =>
		sums.set(ability, (sums.get(ability) ?? 0) + ap);

	for (const row of abilities) {
		let abilityDoublerActive = false;
		for (const [i, ability] of row.entries()) {
			if (ability === "AD") abilityDoublerActive = true;
			if (!STACKABLE_ABILITIES.has(ability)) continue;

			add(
				ability,
				(i === 0 ? MAIN_SLOT_AP : SUB_SLOT_AP) * (abilityDoublerActive ? 2 : 1),
			);
		}

		if (!STACKABLE_ABILITIES.has(row[0])) add(row[0], MAIN_SLOT_AP);
	}

	return sums;
}

function serializeSignature(sums: Map<string, number>) {
	return [...sums.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([ability, ap]) => `${ability}_${ap}`)
		.join(",");
}
