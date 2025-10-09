export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "User" add column "commissionsOpenedAt" integer`,
		).run();

		db.prepare(
			/* sql */ `update "User" set "commissionsOpen" = 0 where "commissionsOpen" = 1`,
		).run();
	})();
}
