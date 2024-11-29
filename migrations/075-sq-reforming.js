export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "Group" add "opinionsAboutReforming" text`,
		).run();
	})();
}
