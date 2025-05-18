export function up(db) {
	for (const table of ["MapPool", "MapPoolMap"]) {
		db.prepare(`drop table "${table}"`).run();
	}

	db.prepare("drop index calendar_event_map_pool_id").run();
	db.prepare(`alter table "CalendarEvent" drop column "mapPoolId"`).run();

	// ---

	db.prepare(
		`
    create table "MapPoolMap" (
      "calendarEventId" integer,
      "stageId" integer not null,
      "mode" text not null,
      foreign key ("calendarEventId") references "CalendarEvent"("id") on delete cascade,
      unique("calendarEventId", "stageId", "mode") on conflict rollback
    ) strict
    `,
	).run();
	db.prepare(
		`create index map_pool_map_calendar_event_id on "MapPoolMap"("calendarEventId")`,
	).run();
}

export function down(db) {
	db.prepare(`drop table "MapPoolMap"`).run();

	// ---

	db.prepare(
		`
    create table "MapPool" (
      "id" integer primary key,
      "code" text not null,
      "ownerId" integer not null,
      foreign key ("ownerId") references "User"("id") on delete restrict
    ) strict
    `,
	).run();
	db.prepare(`create index map_pool_owner_id on "MapPool"("ownerId")`).run();

	db.prepare(
		`
    create table "MapPoolMap" (
      "mapPoolId" integer not null,
      "stageId" integer not null,
      "mode" text not null,
      foreign key ("mapPoolId") references "MapPool"("id") on delete cascade
    ) strict
    `,
	).run();
	db.prepare(
		`create index map_pool_map_map_pool_id on "MapPoolMap"("mapPoolId")`,
	).run();

	db.prepare(
		`alter table "CalendarEvent" add "mapPoolId" integer references "MapPool"("id") on delete set null`,
	).run();
	db.prepare(
		`create index calendar_event_map_pool_id on "CalendarEvent"("mapPoolId")`,
	).run();
}
