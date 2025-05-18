export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "TournamentMatchGameResultParticipant" add "tournamentTeamId" integer`,
		).run();
	})();
}
