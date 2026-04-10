export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `update "TournamentTeamMember" set "role" = 'OWNER' where "isOwner" = 1 and "role" != 'OWNER'`,
		).run();
		db.prepare(
			/* sql */ `update "TournamentTeamMember" set "role" = 'REGULAR' where "isOwner" = 0 and "role" = 'OWNER'`,
		).run();

		db.prepare(
			/* sql */ `alter table "TournamentTeamMember" drop column "isOwner"`,
		).run();
	})();
}
