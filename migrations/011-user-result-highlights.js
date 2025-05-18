export function up(db) {
	db.prepare(
		`
    create table "UserResultHighlight" (
      "teamId" integer not null,
      "userId" integer not null,
      foreign key ("teamId") references "CalendarEventResultTeam"("id") on delete cascade,
      foreign key ("userId") references "User"("id") on delete cascade,
      unique("teamId", "userId") on conflict rollback
    ) strict
    `,
	).run();

	db.prepare(
		`create index user_result_highlight_user_id on "UserResultHighlight"("userId")`,
	).run();

	db.prepare(
		`create index user_result_highlight_team_id on "UserResultHighlight"("teamId")`,
	).run();
}

export function down(db) {
	db.prepare(`drop table "UserResultHighlight"`).run();
}
