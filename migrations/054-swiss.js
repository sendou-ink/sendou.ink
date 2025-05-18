export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "TournamentTeam" add "droppedOut" integer default 0`,
		).run();

		db.prepare(
			/* sql */ `alter table "TournamentMatch" add "createdAt" integer`,
		).run();
	})();
}
