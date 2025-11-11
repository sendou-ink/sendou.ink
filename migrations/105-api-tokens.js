export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
      create table "ApiToken" (
				"id" integer primary key,
        "token" text not null unique,
        "userId" integer not null unique,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        foreign key ("userId") references "User"("id") on delete cascade
      ) strict
      `,
		).run();

		db.prepare(
			/* sql */ `create index api_token_user_id on "ApiToken"("userId")`,
		).run();

		db.prepare(
			/* sql */ `alter table "User" add "isApiAccesser" integer`,
		).run();
	})();
}
