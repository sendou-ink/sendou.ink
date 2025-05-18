export function up(db) {
	db.prepare(/* sql */ `alter table "User" add "patronTill" integer`).run();
}
