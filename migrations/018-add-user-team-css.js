export function up(db) {
	db.prepare(/* sql */ `alter table "User" add "css" text`).run();
	db.prepare(/* sql */ `alter table "AllTeam" add "css" text`).run();
}
