export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `create index skill_user_id_season on "Skill" ("userId", "season");`,
		).run();
	})();
}
