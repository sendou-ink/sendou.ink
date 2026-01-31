export function up(db) {
	db.prepare(/* sql */ `alter table "Tournament" add "tier" integer`).run();
	db.prepare(
		/* sql */ `alter table "TournamentOrganizationSeries" add "tierHistory" text`,
	).run();
}
