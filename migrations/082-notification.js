export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `
  create table "Notification" (
    "id" integer primary key,
    "type" text not null,
    "meta" text,
    "pictureUrl" text,
    "createdAt" integer default (strftime('%s', 'now')) not null
  ) strict
  `,
		).run();

		db.prepare(
			/*sql*/ `create index notification_type on "Notification"("type")`,
		).run();

		db.prepare(
			/*sql*/ `
  create table "NotificationUser" (
    "notificationId" integer not null,
    "userId" integer not null,
    "seen" integer default 0 not null,
    primary key ("notificationId", "userId"),
    foreign key ("notificationId") references "Notification"("id") on delete cascade,
    foreign key ("userId") references "User"("id") on delete cascade
  ) strict
  `,
		).run();

		db.prepare(
			/*sql*/ `create index notification_user_id on "NotificationUser"("userId")`,
		).run();
	})();
}
