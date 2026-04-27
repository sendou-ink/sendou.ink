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
        "tier" integer,
        foreign key ("trophyId") references "Trophy"("id") on delete cascade,
        foreign key ("userId") references "User"("id") on delete cascade,
        foreign key ("tournamentId") references "Tournament"("id") on delete cascade
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `create unique index "trophy_owner_tournament_user_unique" on "TrophyOwner"("tournamentId", "userId", "trophyId")`,
		).run();

		db.prepare(
			/*sql*/ `
      create table "PendingTrophy" (
        "id" integer primary key,
        "name" text not null,
        "model" text not null,
        "description" text not null,
        "organizationId" integer,
        "submitterUserId" integer not null,
        "createdAt" integer not null,
        "declineReason" text,
        "declinedAt" integer,
        "declinedByUserId" integer,
        "targetTrophyId" integer,
        "managerId" integer,
        foreign key ("organizationId") references "TournamentOrganization"("id") on delete set null,
        foreign key ("submitterUserId") references "User"("id") on delete cascade,
        foreign key ("declinedByUserId") references "User"("id") on delete set null,
        foreign key ("targetTrophyId") references "Trophy"("id") on delete cascade,
        foreign key ("managerId") references "User"("id") on delete set null
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `create index "pending_trophy_submitter_idx" on "PendingTrophy"("submitterUserId")`,
		).run();

		db.prepare(
			/*sql*/ `
      create table "PendingTrophyApproval" (
        "pendingTrophyId" integer not null,
        "userId" integer not null,
        "createdAt" integer not null,
        foreign key ("pendingTrophyId") references "PendingTrophy"("id") on delete cascade,
        foreign key ("userId") references "User"("id"),
        unique("pendingTrophyId", "userId")
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `alter table "CalendarEvent" add column "trophyId" integer references "Trophy"("id") on delete set null`,
		).run();
	})();
}
