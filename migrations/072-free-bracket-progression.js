export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "TournamentTeamCheckIn" add "isCheckOut" integer default 0`,
		).run();
	})();
}
