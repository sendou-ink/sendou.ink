export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
        alter table "TournamentOrganizationBannedUser" add column "expiresAt" integer
      `,
		).run();
	})();
}
