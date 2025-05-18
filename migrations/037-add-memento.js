export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `alter table "GroupMatch" add "memento" text`).run();
	})();
}
