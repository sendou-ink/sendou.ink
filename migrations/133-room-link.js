export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
      create table "RoomLink" (
        "userId" integer not null unique,
        "url" text not null,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        "refreshedAt" integer default (strftime('%s', 'now')) not null,
        foreign key ("userId") references "User"("id") on delete cascade
      ) strict
      `,
		).run();
	})();
}
