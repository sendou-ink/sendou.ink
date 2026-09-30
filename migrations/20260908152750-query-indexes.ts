import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		// date window reads (calendar, running tournaments, availability) scanned every event
		await trx.schema
			.createIndex("calendar_event_date_starts_at")
			.on("CalendarEventDate")
			.column("startsAt")
			.execute();

		// the month list skips through this instead of reading every placement
		await trx.schema
			.createIndex("xrank_placement_year_month")
			.on("XRankPlacement")
			.columns(["year", "month"])
			.execute();

		// covers the per match KO count of the bracket read, replacing the matchId only index
		await trx.schema
			.dropIndex("tournament_match_game_result_match_id")
			.execute();
		await trx.schema
			.createIndex("tournament_match_game_result_match_id_winner_team_id_ko")
			.on("TournamentMatchGameResult")
			.columns(["matchId", "winnerTeamId", "ko"])
			.execute();

		// the vods weapon filter walked every player row
		await trx.schema
			.createIndex("video_match_player_weapon_spl_id")
			.on("VideoMatchPlayer")
			.column("weaponSplId")
			.execute();

		// almost no event has a trophy, so to the planner the full index looked as bad as scanning every event
		await trx.schema.dropIndex("calendar_event_trophy_id").execute();
		await trx.schema
			.createIndex("calendar_event_trophy_id")
			.on("CalendarEvent")
			.column("trophyId")
			.where("trophyId", "is not", null)
			.execute();
	});
}
