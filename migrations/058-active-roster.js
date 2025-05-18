export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "TournamentTeam" add "activeRosterUserIds" text`,
		).run();
	})();
}
