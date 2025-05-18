export function up(db) {
	db.prepare(`alter table "CalendarEvent" add "customUrl" text`).run();
	db.prepare(
		`alter table "CalendarEvent" add "toToolsEnabled" integer default 0`,
	).run();
	db.prepare(
		`alter table "CalendarEvent" add "isBeforeStart" integer default 1`,
	).run();
	db.prepare(
		`create unique index calendar_event_custom_url_unique on "CalendarEvent"("customUrl")`,
	).run();

	// TODO: these should be FK's
	db.prepare(`alter table "MapPoolMap" add "tournamentTeamId" integer`).run();
	db.prepare(
		`alter table "MapPoolMap" add "tieBreakerCalendarEventId" integer`,
	).run();
	db.prepare(
		`create index map_pool_map_tournament_team_id on "MapPoolMap"("tournamentTeamId")`,
	).run();
	db.prepare(
		`create index map_pool_map_tie_breaker_calendar_event_id on "MapPoolMap"("tieBreakerCalendarEventId")`,
	).run();

	db.prepare(
		`
    create table "TournamentTeam" (
      "id" integer primary key,
      "name" text not null,
      "createdAt" integer not null,
      "seed" integer,
      "calendarEventId" integer not null,
      foreign key ("calendarEventId") references "CalendarEvent"("id") on delete cascade,
      unique("calendarEventId", "name") on conflict rollback
    ) strict
    `,
	).run();
	db.prepare(
		`create index tournament_team_calendar_event_id on "TournamentTeam"("calendarEventId")`,
	).run();

	db.prepare(
		`
    create table "TournamentTeamMember" (
      "tournamentTeamId" integer not null,
      "userId" integer not null,
      "isOwner" integer not null,
      "createdAt" integer not null,
      foreign key ("tournamentTeamId") references "TournamentTeam"("id") on delete cascade,
      unique("tournamentTeamId", "userId") on conflict rollback
    ) strict
    `,
	).run();
	db.prepare(
		`create index tournament_team_member_tournament_team_id on "TournamentTeamMember"("tournamentTeamId")`,
	).run();
}

export function down(db) {
	db.prepare("drop index calendar_event_custom_url_unique").run();
	db.prepare("drop index map_pool_map_tournament_team_id").run();
	db.prepare("drop index map_pool_map_tie_breaker_calendar_event_id").run();

	db.prepare(`alter table "CalendarEvent" drop column "customUrl"`).run();
	db.prepare(`alter table "CalendarEvent" drop column "toToolsEnabled"`).run();
	db.prepare(`alter table "CalendarEvent" drop column "isBeforeStart"`).run();
	db.prepare(`alter table "MapPoolMap" drop column "tournamentTeamId"`).run();
	db.prepare(
		`alter table "MapPoolMap" drop column "tieBreakerCalendarEventId"`,
	).run();

	db.prepare("drop index tournament_team_calendar_event_id").run();
	db.prepare("drop index tournament_team_member_tournament_team_id").run();

	db.prepare(`drop table "TournamentTeam"`).run();
	db.prepare(`drop table "TournamentTeamMember"`).run();
}
