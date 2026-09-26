import { type Kysely, sql } from "kysely";

type OnDelete = "cascade" | "set null" | "restrict";

interface ForeignKeyToAdd {
	column: string;
	references: string;
	onDelete: OnDelete;
}

const FOREIGN_KEYS_TO_ADD: Record<string, ForeignKeyToAdd[]> = {
	Badge: [{ column: "authorId", references: "User", onDelete: "set null" }],
	BadgeManager: [
		{ column: "badgeId", references: "Badge", onDelete: "cascade" },
		{ column: "userId", references: "User", onDelete: "cascade" },
	],
	TournamentBadgeOwner: [
		{ column: "badgeId", references: "Badge", onDelete: "cascade" },
		{ column: "userId", references: "User", onDelete: "cascade" },
		{ column: "tournamentId", references: "Tournament", onDelete: "cascade" },
	],
	CalendarEvent: [
		{ column: "tournamentId", references: "Tournament", onDelete: "cascade" },
		{
			column: "avatarImgId",
			references: "UnvalidatedUserSubmittedImage",
			onDelete: "set null",
		},
	],
	MapPoolMap: [
		{
			column: "tournamentTeamId",
			references: "TournamentTeam",
			onDelete: "cascade",
		},
	],
	Skill: [
		{ column: "groupMatchId", references: "GroupMatch", onDelete: "restrict" },
	],
	TournamentMatchGameResultParticipant: [
		{
			column: "tournamentTeamId",
			references: "TournamentTeam",
			onDelete: "cascade",
		},
	],
	TournamentStreamer: [
		{ column: "userId", references: "User", onDelete: "set null" },
		{ column: "tournamentId", references: "Tournament", onDelete: "cascade" },
	],
	TournamentTeam: [
		{ column: "teamId", references: "AllTeam", onDelete: "set null" },
		{
			column: "avatarImgId",
			references: "UnvalidatedUserSubmittedImage",
			onDelete: "set null",
		},
	],
	TournamentTeamMember: [
		{ column: "userId", references: "User", onDelete: "cascade" },
	],
	User: [
		{
			column: "customAvatarImgId",
			references: "UnvalidatedUserSubmittedImage",
			onDelete: "set null",
		},
		{
			column: "bannerImgId",
			references: "UnvalidatedUserSubmittedImage",
			onDelete: "set null",
		},
	],
};

// "set null" on a not null column makes deleting the parent fail, and on PlusTier's rowid primary key it reassigns the row to a random id
const SET_NULL_TO_CASCADE: Record<string, RegExp> = {
	PlusTier:
		/(foreign key \("userId"\) references "User"\s*\("id"\) on delete) set null/i,
	UnvalidatedUserSubmittedImage:
		/(foreign key \("submitterUserId"\) references "User"\s*\("id"\) on delete) set null/i,
};

const NEW_INDEXES = [
	`create index "badge_manager_user_id" on "BadgeManager" ("userId")`,
	`create index "tournament_streamer_tournament_id" on "TournamentStreamer" ("tournamentId")`,
	`create index "tournament_streamer_user_id" on "TournamentStreamer" ("userId") where "userId" is not null`,
	`create index "user_custom_avatar_img_id" on "User" ("customAvatarImgId") where "customAvatarImgId" is not null`,
	`create index "user_banner_img_id" on "User" ("bannerImgId") where "bannerImgId" is not null`,
];

const ROWID_PRIMARY_KEY = /"id" integer primary key(?! autoincrement)/i;

/**
 * Without AUTOINCREMENT, SQLite hands out max(id) + 1, so deleting the newest row lets its id be
 * reused by the next insert. Rebuilds every such table with AUTOINCREMENT, and while at it adds the
 * foreign keys that were only ever enforced by convention and fixes on delete actions that can't work.
 */
export async function up(db: Kysely<any>): Promise<void> {
	// a no-op inside a transaction, and needed off so dropping the old tables doesn't cascade
	await sql`pragma foreign_keys = off`.execute(db);

	try {
		await db.transaction().execute(async (trx) => {
			await removeOrphans(trx);

			const tables = await tablesToRebuild(trx);
			const viewsAndTriggers = await dropViewsAndTriggers(trx);

			for (const table of tables) {
				await rebuildTable(trx, table);
			}

			for (const statement of NEW_INDEXES) {
				await sql.raw(statement).execute(trx);
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

async function removeOrphans(trx: Kysely<any>) {
	for (const [table, foreignKeys] of Object.entries(FOREIGN_KEYS_TO_ADD)) {
		for (const { column, references, onDelete } of foreignKeys) {
			const orphan = sql`${sql.ref(column)} is not null and ${sql.ref(column)} not in (select "id" from ${sql.table(references)})`;

			if (onDelete === "cascade") {
				await sql`delete from ${sql.table(table)} where ${orphan}`.execute(trx);
			} else if (onDelete === "set null") {
				await sql`update ${sql.table(table)} set ${sql.ref(column)} = null where ${orphan}`.execute(
					trx,
				);
			}
		}
	}
}

async function tablesToRebuild(trx: Kysely<any>) {
	const { rows } = await sql<{ name: string; sql: string }>`
		select "name", "sql" from "sqlite_master"
		where "type" = 'table'
			and "name" not like 'sqlite_%'
			and "name" not like 'UserSearch_%'
		order by "name"
	`.execute(trx);

	return rows.filter(
		(table) =>
			ROWID_PRIMARY_KEY.test(table.sql) ||
			FOREIGN_KEYS_TO_ADD[table.name] ||
			SET_NULL_TO_CASCADE[table.name],
	);
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

async function rebuildTable(
	trx: Kysely<any>,
	table: { name: string; sql: string },
) {
	const tempName = `${table.name}__rebuild`;

	const { rows: indexes } = await sql<{ sql: string }>`
		select "sql" from "sqlite_master"
		where "type" = 'index' and "tbl_name" = ${table.name} and "sql" is not null
	`.execute(trx);
	// generated columns are left out by table_info, they can't be inserted into
	const { rows: columns } = await sql<{ name: string }>`
		select "name" from pragma_table_info(${table.name})
	`.execute(trx);
	const columnList = columns.map((column) => `"${column.name}"`).join(", ");

	await sql.raw(createTableSql(table.name, table.sql, tempName)).execute(trx);
	await sql
		.raw(
			`insert into "${tempName}" (${columnList}) select ${columnList} from "${table.name}"`,
		)
		.execute(trx);
	await sql.raw(`drop table "${table.name}"`).execute(trx);
	await sql
		.raw(`alter table "${tempName}" rename to "${table.name}"`)
		.execute(trx);

	for (const index of indexes) {
		await sql.raw(index.sql).execute(trx);
	}
}

function createTableSql(name: string, original: string, tempName: string) {
	let result = original.replace(
		new RegExp(`^create table "?${name}"?`, "i"),
		`create table "${tempName}"`,
	);
	if (result === original) {
		throw new Error(`${name}: unexpected create table statement`);
	}

	result = result.replace(
		ROWID_PRIMARY_KEY,
		`"id" integer primary key autoincrement`,
	);

	const setNullClause = SET_NULL_TO_CASCADE[name];
	if (setNullClause) {
		if (!setNullClause.test(result)) {
			throw new Error(`${name}: on delete clause to fix not found`);
		}
		result = result.replace(setNullClause, "$1 cascade");
	}

	const foreignKeys = FOREIGN_KEYS_TO_ADD[name];
	if (foreignKeys) {
		const closingParen = result.search(/\)\s*strict\s*$/i);
		if (closingParen === -1) {
			throw new Error(`${name}: expected a strict table`);
		}
		const clauses = foreignKeys.map(
			({ column, references, onDelete }) =>
				`foreign key ("${column}") references "${references}"("id") on delete ${onDelete}`,
		);
		result = `${result.slice(0, closingParen).trimEnd()},\n\t${clauses.join(",\n\t")}\n) strict`;
	}

	return result;
}
