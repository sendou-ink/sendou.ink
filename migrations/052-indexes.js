export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql */ `create index group_match_created_at on "GroupMatch"("createdAt")`,
		).run();
		db.prepare(/*sql */ `create index skill_season on "Skill"("season")`).run();
	})();
}
