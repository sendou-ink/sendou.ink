export function up(db) {
	db.prepare(
		/* sql */ `alter table "Build" add "private" integer default 0`,
	).run();
}
