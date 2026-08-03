export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
				create table "GroupMatchCancelReport" (
					"id" integer primary key autoincrement,
					"groupMatchId" integer not null,
					"groupId" integer not null,
					"authorUserId" integer not null,
					"reason" text not null,
					"createdAt" integer default (strftime('%s', 'now')) not null,
					foreign key ("groupMatchId") references "GroupMatch"("id") on delete cascade,
					foreign key ("groupId") references "Group"("id") on delete cascade,
					foreign key ("authorUserId") references "User"("id") on delete cascade,
					unique ("groupMatchId", "groupId")
				) strict
			`,
		).run();

		db.prepare(
			/* sql */ `
				create table "GroupMatchCancelReportPlayer" (
					"cancelReportId" integer not null,
					"userId" integer not null,
					foreign key ("cancelReportId") references "GroupMatchCancelReport"("id") on delete cascade,
					foreign key ("userId") references "User"("id") on delete cascade,
					unique ("cancelReportId", "userId")
				) strict
			`,
		).run();

		db.prepare(
			/* sql */ `create index group_match_cancel_report_player_user_id_idx on "GroupMatchCancelReportPlayer"("userId")`,
		).run();

		db.pragma("foreign_key_check");
	})();
}
