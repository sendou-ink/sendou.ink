export function up(db) {
	db.prepare(
		/* sql */ `
    drop table "UnvalidatedUserSubmittedImage"
  `,
	).run();

	db.prepare(
		/*sql*/ `
    create table "UnvalidatedUserSubmittedImage" (
      "id" integer primary key,
      "validatedAt" integer,
      "url" text not null unique,
      "submitterUserId" integer not null,
      foreign key ("submitterUserId") references "User"("id") on delete set null
    ) strict
    `,
	).run();

	db.prepare(
		`create index submitter_user_id on "UnvalidatedUserSubmittedImage"("submitterUserId")`,
	).run();
}
