export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "TournamentStage" add "createdAt" integer`,
		).run();

		db.prepare(
			/* sql */ `alter table "Tournament" add "castedMatchesInfo" text`,
		).run();

		db.prepare(
			/* sql */ `alter table "TournamentMatch" drop "childCount"`,
		).run();
	})();
}
