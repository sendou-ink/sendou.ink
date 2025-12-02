export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `alter table "User" add "lastSubMessage" text`).run();
	})();
}
