export function up(db) {
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

export function down(db) {
	for (const table of ["MapPool", "MapPoolMap"]) {
		db.prepare(`drop table "${table}"`).run();
	}

	db.prepare("drop index calendar_event_map_pool_id").run();
	db.prepare(`alter table "CalendarEvent" drop column "mapPoolId"`).run();
}
