import { type Kysely, sql } from "kysely";

/** Teams that don't count for team leaderboard placements, e.g. because they want to qualify with another roster */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("LeaderboardTeamSkip")
			.addColumn("id", "integer", (col) => col.primaryKey())
			.addColumn("season", "integer", (col) => col.notNull())
			.addColumn("identifier", "text", (col) => col.notNull())
			.addColumn("skippedByUserId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			// every table in this schema is strict
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("leaderboard_team_skip_season_identifier")
			.on("LeaderboardTeamSkip")
			.columns(["season", "identifier"])
			.unique()
			.execute();

		// the team that the hardcoded list this table replaces held. Attributed to the
		// admin, who made the call back then. Inserts nothing on databases without them
		await sql`
			insert into "LeaderboardTeamSkip" ("season", "identifier", "skippedByUserId")
			select 5, '9403-13562-15916-38062', "User"."id" from "User" where "User"."id" = 274
		`.execute(trx);
	});
}
