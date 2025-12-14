export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `alter table "LFGPost" add "languages" text`).run();
		db.prepare(
			/* sql */ `update "LFGPost" set "languages" = (select "languages" from "User" where "User"."id" = "LFGPost"."authorId")`,
		).run();
	})();
}
