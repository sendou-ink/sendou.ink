export function up(db) {
	db.prepare(
		/*sql*/ `create index tournament_result_tournament_team_id on "TournamentResult"("tournamentTeamId")`,
	).run();
}
