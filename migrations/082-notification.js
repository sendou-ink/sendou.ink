export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `
    create table "Notification" (
      "id" integer primary key,
      "seen" integer default 0 not null,
      "value" text not null,
      "userId" integer not null,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      foreign key ("userId") references "User"("id") on delete cascade
    ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `create index notification_user_id on "Notification"("userId")`,
		).run();
	})();
}
