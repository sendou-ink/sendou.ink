export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `alter table "GroupMember" add "note" text`).run();
	})();
}
