export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
        create index if not exists calendar_event_date_event_id_start_time on "CalendarEventDate"("eventId", "startTime" desc)
      `,
		).run();
	})();
}
