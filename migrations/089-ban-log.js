export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `create table "BanLog" (
				"id" integer primary key,
				"userId" integer not null,
				"banned" integer,
				"bannedReason" text,
				"bannedByUserId" integer not null,
				"createdAt" integer default (strftime('%s', 'now')) not null,
				foreign key ("userId") references "User"("id") on delete restrict,
				foreign key ("bannedByUserId") references "User"("id") on delete restrict
			)`,
		).run();

		db.prepare(
			/*sql*/ `create index ban_log_user_id on "BanLog"("userId")`,
		).run();

		db.prepare(
			/* sql */ `create table "ModNote" (
				"id" integer primary key,
				"userId" integer not null,
				"authorId" integer not null,
				"text" text not null,
				"createdAt" integer default (strftime('%s', 'now')) not null,
				"isDeleted" integer not null default 0,
				foreign key ("userId") references "User"("id") on delete restrict,
				foreign key ("authorId") references "User"("id") on delete restrict
			)`,
		).run();

		db.prepare(
			/*sql*/ `create index mod_note_user_id on "ModNote"("userId")`,
		).run();
	})();
}
