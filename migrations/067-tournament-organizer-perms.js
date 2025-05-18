export function up(db) {
	db.prepare(
		`alter table "User" add column "isTournamentOrganizer" integer default 0`,
	).run();
}
