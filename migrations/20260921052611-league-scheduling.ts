import { type Kysely, sql } from "kysely";

/**
 * League sets are scheduled by the teams: candidate times go on a board per match, the agreed time
 * lands on the match. A round's play time only says when it is playable from, hence the rename.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("TournamentRound")
			.renameColumn("defaultPlayTime", "isPlayableAt")
			.execute();

		await trx.schema
			.alterTable("TournamentMatch")
			.addColumn("scheduledAt", "integer")
			.execute();
		await trx.schema
			.alterTable("TournamentMatch")
			.addColumn("scheduleSetByOrganizer", "integer", (col) =>
				col.notNull().defaultTo(0),
			)
			.execute();

		await trx.schema
			.createTable("TournamentMatchScheduleProposal")
			.addColumn("id", "integer", (col) => col.primaryKey())
			.addColumn("matchId", "integer", (col) =>
				col.notNull().references("TournamentMatch.id").onDelete("cascade"),
			)
			.addColumn("tournamentTeamId", "integer", (col) =>
				col.notNull().references("TournamentTeam.id").onDelete("cascade"),
			)
			.addColumn("authorId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("proposedAt", "integer", (col) => col.notNull())
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.addUniqueConstraint("tournament_match_schedule_proposal_unique", [
				"matchId",
				"tournamentTeamId",
				"proposedAt",
			])
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("tournament_match_schedule_proposal_match_id")
			.on("TournamentMatchScheduleProposal")
			.column("matchId")
			.execute();
		await trx.schema
			.createIndex("tournament_match_schedule_proposal_tournament_team_id")
			.on("TournamentMatchScheduleProposal")
			.column("tournamentTeamId")
			.execute();
		await trx.schema
			.createIndex("tournament_match_schedule_proposal_author_id")
			.on("TournamentMatchScheduleProposal")
			.column("authorId")
			.execute();
		await trx.schema
			.createIndex("tournament_match_scheduled_at")
			.on("TournamentMatch")
			.column("scheduledAt")
			.execute();
	});
}
