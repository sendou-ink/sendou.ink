export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
				alter table "GroupMatch"
					add column "noScreen" integer default 0 not null
			`,
		).run();

		db.pragma("foreign_key_check");
	})();
}
