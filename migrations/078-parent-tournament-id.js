export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "Tournament" add "parentTournamentId" integer references "Tournament"("id") on delete restrict`,
		).run();

		db.prepare(
			/* sql */ `alter table "CalendarEvent" add "hidden" integer default 0`,
		).run();
	})();
}
