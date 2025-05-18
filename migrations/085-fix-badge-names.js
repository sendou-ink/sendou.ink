export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `update "Badge" set "code" = 'fl-collegiate' where "code" = 'FLcollegiate'`,
		).run();
	})();
}
