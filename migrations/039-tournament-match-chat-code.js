export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "TournamentMatch" add "chatCode" text`,
		).run();
	})();
}
