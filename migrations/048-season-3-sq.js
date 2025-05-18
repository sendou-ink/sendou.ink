export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `update "User" set "mapModePreferences" = null`).run();
		db.prepare(/* sql */ `update "User" set "noScreen" = 0`).run();

		db.prepare(
			/* sql */ `alter table "GroupLike" add "isRechallenge" integer`,
		).run();

		db.prepare(
			/*sql*/ `
      create table "UserFriendCode" (
        "friendCode" text not null,
        "userId" integer not null,
        "submitterUserId" integer not null,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        foreign key ("userId") references "User"("id") on delete cascade,
        foreign key ("submitterUserId") references "User"("id") on delete cascade
      ) strict
    `,
		).run();
	})();
}
