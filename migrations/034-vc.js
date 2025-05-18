export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `alter table "User" add "vc" text default "NO"`).run();
		db.prepare(/* sql */ `alter table "User" add "languages" text`).run();
	})();
}
