export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `alter table "Group" add "chatCode" text`).run();
		db.prepare(/* sql */ `alter table "GroupMatch" add "chatCode" text`).run();
	})();
}
