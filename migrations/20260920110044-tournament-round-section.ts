import { type Kysely, sql } from "kysely";

/**
 * A tournament group is now always a set of participants playing among themselves. The winners bracket,
 * losers bracket and finals of an elimination stage were separate groups; they collapse into one group
 * and the new `TournamentRound.section` tells them apart. Round numbers restart per section, so the
 * (number, groupId) uniqueness of rounds is rebuilt to include the section.
 */
export async function up(db: Kysely<any>): Promise<void> {
	// a no-op inside a transaction, and needed off so dropping the old rounds table doesn't cascade
	await sql`pragma foreign_keys = off`.execute(db);

	try {
		await db.transaction().execute(async (trx) => {
			await sql`
				create table "TournamentRound_new" (
					"id" integer primary key,
					"stageId" integer not null,
					"groupId" integer not null,
					"number" integer not null,
					"maps" text,
					"defaultPlayTime" integer,
					"section" text check ("section" in ('winners', 'losers', 'finals')),
					foreign key ("stageId") references "TournamentStage" ("id") on delete cascade,
					foreign key ("groupId") references "TournamentGroup" ("id") on delete cascade
				) strict
			`.execute(trx);

			await sql`
				insert into "TournamentRound_new" ("id", "stageId", "groupId", "number", "maps", "defaultPlayTime", "section")
				select
					"TournamentRound"."id",
					"TournamentRound"."stageId",
					coalesce("MainGroup"."id", "TournamentRound"."groupId"),
					"TournamentRound"."number",
					"TournamentRound"."maps",
					"TournamentRound"."defaultPlayTime",
					case
						when "TournamentStage"."type" = 'single_elimination' and "TournamentGroup"."number" = 1 then 'winners'
						when "TournamentStage"."type" = 'single_elimination' and "TournamentGroup"."number" = 2 then 'finals'
						when "TournamentStage"."type" = 'double_elimination' and "TournamentGroup"."number" = 1 then 'winners'
						when "TournamentStage"."type" = 'double_elimination' and "TournamentGroup"."number" = 2 then 'losers'
						when "TournamentStage"."type" = 'double_elimination' and "TournamentGroup"."number" = 3 then 'finals'
						else null
					end
				from "TournamentRound"
				inner join "TournamentGroup" on "TournamentGroup"."id" = "TournamentRound"."groupId"
				inner join "TournamentStage" on "TournamentStage"."id" = "TournamentRound"."stageId"
				left join "TournamentGroup" as "MainGroup"
					on "MainGroup"."stageId" = "TournamentStage"."id"
					and "MainGroup"."number" = 1
					and "TournamentStage"."type" in ('single_elimination', 'double_elimination')
				order by "TournamentRound"."id" asc
			`.execute(trx);

			const unsectioned = await sql<{ count: number }>`
				select count(*) as "count"
				from "TournamentRound_new"
				inner join "TournamentStage" on "TournamentStage"."id" = "TournamentRound_new"."stageId"
				where "TournamentStage"."type" in ('single_elimination', 'double_elimination')
					and "TournamentRound_new"."section" is null
			`.execute(trx);
			if (unsectioned.rows[0].count > 0) {
				throw new Error(
					`${unsectioned.rows[0].count} elimination rounds could not be assigned a section`,
				);
			}

			await sql`drop table "TournamentRound"`.execute(trx);
			await sql`alter table "TournamentRound_new" rename to "TournamentRound"`.execute(
				trx,
			);

			await trx.schema
				.createIndex("tournament_round_stage_id")
				.on("TournamentRound")
				.column("stageId")
				.execute();
			await trx.schema
				.createIndex("tournament_round_group_id")
				.on("TournamentRound")
				.column("groupId")
				.execute();
			// nulls never collide in a unique index, so the unsectioned rounds get an index of their own
			await sql`
				create unique index "tournament_round_group_id_number_section"
				on "TournamentRound" ("groupId", "number", "section")
				where "section" is not null
			`.execute(trx);
			await sql`
				create unique index "tournament_round_group_id_number"
				on "TournamentRound" ("groupId", "number")
				where "section" is null
			`.execute(trx);

			await sql`
				update "TournamentMatch"
				set "groupId" = (
					select "MainGroup"."id"
					from "TournamentGroup" as "MainGroup"
					where "MainGroup"."stageId" = "TournamentMatch"."stageId"
						and "MainGroup"."number" = 1
				)
				where "stageId" in (
					select "id" from "TournamentStage"
					where "type" in ('single_elimination', 'double_elimination')
				)
			`.execute(trx);

			await sql`
				delete from "TournamentGroup"
				where "number" > 1
					and "stageId" in (
						select "id" from "TournamentStage"
						where "type" in ('single_elimination', 'double_elimination')
					)
			`.execute(trx);

			await rewritePreparedMaps(trx);

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

const SECTION_BY_GROUP_ID: Record<string, Record<number, string>> = {
	single_elimination: { 0: "winners", 1: "finals" },
	double_elimination: { 0: "winners", 1: "losers", 2: "finals" },
};

function parseJson(value: unknown) {
	return typeof value === "string" ? JSON.parse(value) : value;
}

/** Prepared map entries pointed at the local group id of the bracket preview, now they carry the section instead. */
async function rewritePreparedMaps(trx: Kysely<any>) {
	const tournaments = await trx
		.selectFrom("Tournament")
		.select(["id", "settings", "preparedMaps"])
		.where("preparedMaps", "is not", null)
		.execute();

	for (const tournament of tournaments) {
		const bracketProgression: Array<{ type: string }> = parseJson(
			tournament.settings,
		).bracketProgression;
		const preparedByBracket: Array<{
			maps: Array<Record<string, unknown>>;
		} | null> = parseJson(tournament.preparedMaps);

		const rewritten = preparedByBracket.map((prepared, bracketIdx) => {
			if (!prepared) return prepared;

			const sections =
				SECTION_BY_GROUP_ID[bracketProgression[bracketIdx]?.type];

			return {
				...prepared,
				maps: prepared.maps.map(({ groupId, ...maps }) => ({
					...maps,
					section: sections?.[groupId as number] ?? null,
				})),
			};
		});

		await trx
			.updateTable("Tournament")
			.set({ preparedMaps: JSON.stringify(rewritten) })
			.where("id", "=", tournament.id)
			.execute();
	}
}
