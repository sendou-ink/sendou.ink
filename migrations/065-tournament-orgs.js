export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `
      create table "TournamentOrganization" (
        "id" integer primary key,
        "name" text not null,
        "slug" text unique not null,
        "description" text,
        "socials" text,
        "avatarImgId" integer,
        foreign key ("avatarImgId") references "UnvalidatedUserSubmittedImage"("id") on delete set null
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `create index tournament_organization_slug on "TournamentOrganization"("slug")`,
		).run();

		db.prepare(
			/*sql*/ `
      create table "TournamentOrganizationMember" (
        "organizationId" integer not null,
        "userId" integer not null,
        "role" text not null,
        "roleDisplayName" text,
        foreign key ("organizationId") references "TournamentOrganization"("id") on delete cascade,
        foreign key ("userId") references "User"("id") on delete cascade,
				unique("organizationId", "userId") on conflict rollback
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `
      create table "TournamentOrganizationBadge" (
        "organizationId" integer not null,
        "badgeId" integer not null,
        foreign key ("organizationId") references "TournamentOrganization"("id") on delete cascade,
        foreign key ("badgeId") references "Badge"("id") on delete cascade,
				unique("organizationId", "badgeId") on conflict rollback
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `
      create table "TournamentOrganizationSeries" (
				"id" integer primary key,
        "organizationId" integer not null,
        "name" text not null,
				"description" text,
        "substringMatches" text not null,
				"showLeaderboard" integer not null default 0,
        foreign key ("organizationId") references "TournamentOrganization"("id") on delete cascade
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `create index tournament_organization_series_organization_id on "TournamentOrganizationSeries"("organizationId")`,
		).run();

		db.prepare(
			/* sql */ `alter table "CalendarEvent" add "organizationId" integer references "TournamentOrganization"("id") on delete set null`,
		).run();
		db.prepare(
			/*sql*/ `create index calendar_event_organization_id on "CalendarEvent"("organizationId")`,
		).run();
	})();
}
