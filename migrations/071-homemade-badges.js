export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `alter table "Badge" add "authorId" integer`).run();
	})();

	db.prepare(
		/* sql */ `create index badge_author_id on "Badge"("authorId")`,
	).run();
}
