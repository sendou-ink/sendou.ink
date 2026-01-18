export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "User" add "customTheme" text default null`,
		).run();
		db.prepare(/* sql */ `alter table "User" drop column "css"`).run();

		db.prepare(
			/* sql */ `alter table "AllTeam" add "customTheme" text default null`,
		).run();
		db.prepare(/* sql */ `alter table "AllTeam" drop column "css"`).run();
	})();
}
