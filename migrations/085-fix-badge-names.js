export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `update "Badge" set "code" = 'flcollegiate' where "code" = 'FLcollegiate'`,
		).run();
	})();
}
