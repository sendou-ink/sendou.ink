export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "TournamentMatch" add "startedAt" integer`,
		).run();

		db.prepare(
			/* sql */ `alter table "TournamentMatch" drop column "createdAt"`,
		).run();
	})();
}
