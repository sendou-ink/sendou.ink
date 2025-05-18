export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "CalendarEvent" add "avatarImgId" integer`,
		).run();

		db.prepare(
			/* sql */ `alter table "CalendarEvent" add "avatarMetadata" text`,
		).run();
	})();
}
