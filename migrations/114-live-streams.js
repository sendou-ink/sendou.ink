export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `
      create table "LiveStream" (
        "id" integer primary key,
        "userId" integer unique,
        "viewerCount" integer not null,
        "thumbnailUrl" text not null,
        "twitch" text,
        foreign key ("userId") references "User"("id") on delete cascade
      ) strict
      `,
		).run();

		db.prepare(/*sql*/ `create index user_twitch on "User"("twitch")`).run();
		db.prepare(
			/*sql*/ `create index livestream_twitch on "LiveStream"("twitch")`,
		).run();
	})();
}
