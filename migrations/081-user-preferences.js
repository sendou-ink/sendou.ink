export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `alter table "User" add "preferences" text`).run();
	})();
}
