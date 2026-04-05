export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `
      create table "Trophy" (
        "id" integer primary key,
        "name" text not null,
        "model" text not null,
        "organizationId" integer,
        "creatorId" integer not null,
        "managerId" integer not null,
        foreign key ("organizationId") references "TournamentOrganization"("id") on delete set null,
        foreign key ("creatorId") references "User"("id"),
        foreign key ("managerId") references "User"("id")
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `
      create table "TrophyOwner" (
        "trophyId" integer not null,
        "userId" integer not null,
        "tournamentId" integer not null,
        foreign key ("trophyId") references "Trophy"("id") on delete cascade,
        foreign key ("userId") references "User"("id") on delete cascade,
        foreign key ("tournamentId") references "Tournament"("id") on delete cascade
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `create unique index "trophy_owner_tournament_user_unique" on "TrophyOwner"("tournamentId", "userId", "trophyId")`,
		).run();
	})();
}
