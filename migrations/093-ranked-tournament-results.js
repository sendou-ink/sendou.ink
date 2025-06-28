export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "TournamentResult" add "setResults" text not null default '[]'`,
		).run();
		db.prepare(
			/* sql */ `alter table "TournamentResult" add "mapResults" text not null default '[]'`,
		).run();
		db.prepare(
			/* sql */ `alter table "TournamentResult" add "spDiff" real`,
		).run();
	})();
}
