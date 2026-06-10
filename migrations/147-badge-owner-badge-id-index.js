export function up(db) {
	db.transaction(() => {
		// Lets badge page owner listings (BadgeOwner view filtered by badgeId)
		// search instead of scanning the whole table.
		db.prepare(
			/* sql */ `create index tournament_badge_owner_badge_id on "TournamentBadgeOwner"("badgeId")`,
		).run();
	})();
}
