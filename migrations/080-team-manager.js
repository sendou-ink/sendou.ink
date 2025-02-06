export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "AllTeamMember" add "isManager" integer default 0`,
		).run();
	})();
}
