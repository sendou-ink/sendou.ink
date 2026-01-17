export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `
      create table "LiveStream" (
        "id" integer primary key,
        "userId" integer not null unique,
        "url" text not null,
        "viewerCount" integer not null,
        "thumbnailUrl" text not null,
        foreign key ("userId") references "User"("id") on delete cascade
      ) strict
      `,
		).run();

		db.prepare(/*sql*/ `create index user_twitch on "User"("twitch")`).run();
	})();
}
