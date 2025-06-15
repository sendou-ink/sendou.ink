export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
        create table "TournamentOrganizationBannedUser" (
          "organizationId" integer not null references "TournamentOrganization"("id") on delete cascade,
          "userId" integer not null references "User"("id") on delete restrict,
          "privateReason" text,
          "updatedAt" integer default (strftime('%s', 'now')) not null,
          unique("organizationId", "userId") on conflict replace
        )
      `,
		).run();
	})();
}
