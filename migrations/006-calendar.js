export function up(db) {
	db.prepare(
		`
    create table "CalendarEvent" (
      "id" integer primary key,
      "name" text not null,
      "authorId" integer not null,
      "bracketUrl" text not null,
      "description" text,
      "discordInviteCode" text,
      "discordUrl" text generated always as ('https://discord.gg/' || "discordInviteCode") virtual,
      "participantCount" integer,
      "tags" text,
      foreign key ("authorId") references "User"("id") on delete restrict
    ) strict
    `,
	).run();

	db.prepare(
		` 
    create table "CalendarEventDate" (
      "id" integer primary key,
      "eventId" integer not null,
      "startTime" integer not null,
      foreign key ("eventId") references "CalendarEvent"("id") on delete cascade
    ) strict
    `,
	).run();

	db.prepare(
		`
    create table "CalendarEventResultTeam" (
      "id" integer primary key,
      "eventId" integer not null,
      "name" text not null,
      "placement" integer not null,
      foreign key ("eventId") references "CalendarEvent"("id") on delete cascade
    ) strict
    `,
	).run();

	db.prepare(
		`
    create table "CalendarEventResultPlayer" (
      "teamId" integer not null,
      "userId" integer,
      "name" text,
      foreign key ("teamId") references "CalendarEventResultTeam"("id") on delete cascade,
      foreign key ("userId") references "User"("id") on delete restrict
    ) strict
    `,
	).run();

	db.prepare(
		`
    create table "CalendarEventBadge" (
      "eventId" integer not null,
      "badgeId" integer not null,
      foreign key ("eventId") references "CalendarEvent"("id") on delete cascade,
      foreign key ("badgeId") references "Badge"("id") on delete restrict,
      unique("eventId", "badgeId") on conflict rollback
    ) strict
    `,
	).run();
}

export function down(db) {
	for (const table of [
		"CalendarEventDate",
		"CalendarEventResultPlayer",
		"CalendarEventResultTeam",
		"CalendarEventBadge",
		"CalendarEvent",
	]) {
		db.prepare(`drop table "${table}"`).run();
	}
}
