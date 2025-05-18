export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `alter table "User" add "bsky" text`).run();

		db.prepare(/* sql */ `alter table "AllTeam" add "bsky" text`).run();
	})();
}
