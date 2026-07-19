export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
				alter table "UserReport"
					add column "matchId" integer
						references "GroupMatch"("id") on delete set null
			`,
		).run();

		db.pragma("foreign_key_check");
	})();
}
