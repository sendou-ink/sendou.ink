export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "tournamentTeamMember" add "inGameName" text`,
		).run();
	})();
}
