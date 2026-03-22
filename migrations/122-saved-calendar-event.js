export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
      create table "SavedCalendarEvent" (
        "id" integer primary key,
        "userId" integer not null,
        "calendarEventId" integer not null,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        unique("userId", "calendarEventId") on conflict rollback,
        foreign key ("userId") references "User"("id") on delete cascade,
        foreign key ("calendarEventId") references "CalendarEvent"("id") on delete cascade
      ) strict`,
		).run();

		db.prepare(
			`create index saved_calendar_event_user_id on "SavedCalendarEvent"("userId")`,
		).run();
		db.prepare(
			`create index saved_calendar_event_calendar_event_id on "SavedCalendarEvent"("calendarEventId")`,
		).run();
	})();
}
