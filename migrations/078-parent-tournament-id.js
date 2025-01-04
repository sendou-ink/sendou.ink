// xxx: can child tournaments not have calendar event linked?
export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "Tournament" add "parentTournamentId" integer references "Tournament"("id") on delete restrict`,
		).run();
	})();
}
