export function up(db) {
	db.prepare(
		/* sql */ `alter table "Tournament" add column "castYoutubeChannels" text`,
	).run();
}
