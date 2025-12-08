export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "TournamentMatch" add "endedEarly" integer default 0`,
		).run();
	})();
}
