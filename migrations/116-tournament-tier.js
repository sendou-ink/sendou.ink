export function up(db) {
	db.prepare(/* sql */ `alter table "Tournament" add "tier" integer`).run();
}
