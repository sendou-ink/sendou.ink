export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "Tournament" add "preparedMaps" text`,
		).run();
		db.prepare(
			/* sql */ `alter table "Tournament" drop column "showMapListGenerator"`,
		).run();
	})();
}
