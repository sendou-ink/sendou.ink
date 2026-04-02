export function up(db) {
	db.prepare(
		/* sql */ `alter table "AllTeam" add column "mapModePreferences" text`,
	).run();
}
