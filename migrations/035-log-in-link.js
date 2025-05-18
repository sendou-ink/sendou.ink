export function up(db) {
	db.prepare(
		/*sql*/ `
    create table "LogInLink" (
      "code" text unique not null,
      "expiresAt" integer not null,
      "userId" integer not null,
      foreign key ("userId") references "User"("id") on delete cascade
    ) strict
  `,
	).run();
}
