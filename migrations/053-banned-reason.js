export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `alter table "User" add "bannedReason" text`).run();
	})();
}
