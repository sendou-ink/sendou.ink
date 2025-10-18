export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "ScrimPostRequest" add "message" text`,
		).run();
		db.prepare(
			/* sql */ `alter table "ScrimPost" add "rangeEnd" integer`,
		).run();
		db.prepare(
			/* sql */ `alter table "ScrimPostRequest" add "at" integer`,
		).run();
	})();
}
