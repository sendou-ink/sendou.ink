export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
				create table "TournamentTeamHistory" (
					"tournamentTeamId" integer primary key,
					"tournamentId" integer not null,
					"name" text not null,
					foreign key ("tournamentId") references "Tournament"("id") on delete cascade
				) strict
			`,
		).run();

		// xxx: no enum check, we will keep it dynamic
		db.prepare(
			/* sql */ `
				create table "TournamentAuditLog" (
					"id" integer primary key autoincrement,
					"tournamentId" integer not null,
					"type" text not null check (
						"type" in (
							'MEMBER_ADDED',
							'MEMBER_REMOVED',
							'TEAM_REGISTERED',
							'TEAM_UNREGISTERED',
							'TEAM_CHECKED_IN',
							'TEAM_CHECKED_OUT',
							'TEAM_DROPPED_OUT',
							'TEAM_DROP_OUT_UNDONE'
						)
					),
					"actorUserId" integer not null,
					"subjectUserId" integer,
					"tournamentTeamId" integer,
					"metadata" text,
					"createdAt" integer not null,
					foreign key ("tournamentId") references "Tournament"("id") on delete cascade,
					foreign key ("actorUserId") references "User"("id"),
					foreign key ("subjectUserId") references "User"("id"),
					foreign key ("tournamentTeamId") references "TournamentTeamHistory"("tournamentTeamId")
				) strict
			`,
		).run();

		// xxx: which indexes are the best?
		db.prepare(
			/* sql */ `create index tournament_audit_log_tournament_id_created_at_idx on "TournamentAuditLog"("tournamentId", "createdAt")`,
		).run();

		db.pragma("foreign_key_check");
	})();
}
