export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "Tournament" add "seedingSnapshot" text default null`,
		).run();
	})();
}
