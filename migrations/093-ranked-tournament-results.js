export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "TournamentResult" add "setResults" text`,
		).run();
		db.prepare(
			/* sql */ `alter table "TournamentResult" add "mapResults" text`,
		).run();
		db.prepare(
			/* sql */ `alter table "TournamentResult" add "spDiff" real`,
		).run();
	})();
}
