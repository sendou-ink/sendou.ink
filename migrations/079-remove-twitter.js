export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `alter table "User" drop column "twitter"`).run();
		db.prepare(/* sql */ `alter table "AllTeam" drop column "twitter"`).run();

		db.prepare(/* sql */ `update "User" set "bsky" = null`).run();
	})();
}
