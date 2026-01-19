export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
			create table "ApiToken_new" (
				"id" integer primary key,
				"token" text not null unique,
				"userId" integer not null,
				"type" text not null default 'read',
				"createdAt" integer default (strftime('%s', 'now')) not null,
				foreign key ("userId") references "User"("id") on delete cascade
			) strict
			`,
		).run();

		db.prepare(
			/* sql */ `
			insert into "ApiToken_new" ("id", "token", "userId", "type", "createdAt")
			select "id", "token", "userId", 'read', "createdAt"
			from "ApiToken"
			`,
		).run();

		db.prepare(/* sql */ "drop table ApiToken").run();

		db.prepare(
			/* sql */ `alter table "ApiToken_new" rename to "ApiToken"`,
		).run();

		db.prepare(
			/* sql */ `create unique index api_token_user_id_type on "ApiToken"("userId", "type")`,
		).run();
	})();
}
