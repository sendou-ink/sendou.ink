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

		db.prepare(
			/* sql */ `alter table "User" add "noSplatnet" integer default 0`,
		).run();

		db.prepare(
			/* sql */ `alter table "GroupMatch" add "confirmedAt" integer`,
		).run();

		db.prepare(
			/* sql */ `alter table "GroupMatch" add "confirmedByUserId" integer references "User"("id")`,
		).run();
	})();
}
