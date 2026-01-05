export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "AllTeamMember" add "memberOrder" integer`,
		).run();
		db.prepare(
			/* sql */ `alter table "AllTeamMember" add "customRole" text`,
		).run();
		db.prepare(
			/* sql */ `alter table "AllTeamMember" add "roleType" text`,
		).run();
	})();
}
