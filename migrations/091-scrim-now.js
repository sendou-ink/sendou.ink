export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "ScrimPost" add "isScheduledForFuture" integer default 1`,
		).run();
	})();
}
