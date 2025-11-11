export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `alter table "AllTeam" add "tag" text`).run();
	})();
}
