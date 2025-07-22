export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "TournamentBadgeOwner" add "tournamentId" integer`,
		).run();
		db.prepare(
			`create unique index badge_owner_tournament_user_unique on "TournamentBadgeOwner"("tournamentId", "userId")`,
		).run();
	})();
}
