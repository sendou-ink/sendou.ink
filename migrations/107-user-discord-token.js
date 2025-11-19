export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
      create table "UserDiscordToken" (
				"userId" integer primary key,
        "accessToken" text not null,
        "refreshToken" text not null,
        "expiresAt" integer not null,
        foreign key ("userId") references "User"("id") on delete cascade
      ) strict
      `,
		).run();
	})();
}
