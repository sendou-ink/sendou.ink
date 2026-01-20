export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
      create table "UserWidget" (
        "userId" integer not null,
        "index" integer not null,
        "widget" text not null,
        primary key ("userId", "index"),
        foreign key ("userId") references "User"("id") on delete cascade
      ) strict
      `,
		).run();

		db.prepare(
			/* sql */ `create index user_widget_user_id on "UserWidget"("userId")`,
		).run();
	})();
}
