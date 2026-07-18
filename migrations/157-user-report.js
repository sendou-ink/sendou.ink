export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
				create table "UserReport" (
					"id" integer primary key autoincrement,
					"reportedUserId" integer not null,
					"reporterUserId" integer not null,
					"category" text not null,
					"description" text not null,
					"createdAt" integer default (strftime('%s', 'now')) not null,
					foreign key ("reportedUserId") references "User"("id") on delete cascade,
					foreign key ("reporterUserId") references "User"("id") on delete cascade,
					unique ("reportedUserId", "reporterUserId")
				) strict
			`,
		).run();

		db.prepare(
			/* sql */ `create index user_report_reported_user_id_idx on "UserReport"("reportedUserId")`,
		).run();

		db.pragma("foreign_key_check");
	})();
}
