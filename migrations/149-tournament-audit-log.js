export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
				create table "TournamentTeamHistory" (
					"id" integer primary key autoincrement,
					"tournamentTeamId" integer not null,
					"tournamentId" integer not null,
					"name" text not null,
					foreign key ("tournamentId") references "Tournament"("id") on delete cascade
				) strict
			`,
		).run();

		db.prepare(
			/* sql */ `
				create table "TournamentAuditLog" (
					"id" integer primary key autoincrement,
					"tournamentId" integer not null,
					"type" text not null,
					"actorUserId" integer not null,
					"subjectUserId" integer,
					"tournamentTeamHistoryId" integer,
					"metadata" text,
					"createdAt" integer not null,
					foreign key ("tournamentId") references "Tournament"("id") on delete cascade,
					foreign key ("actorUserId") references "User"("id"),
					foreign key ("subjectUserId") references "User"("id"),
					foreign key ("tournamentTeamHistoryId") references "TournamentTeamHistory"("id")
				) strict
			`,
		).run();

		db.prepare(
			/* sql */ `alter table "TournamentTeam" add column "tournamentTeamHistoryId" integer references "TournamentTeamHistory"("id")`,
		).run();

		db.prepare(
			/* sql */ `create index tournament_audit_log_tournament_id_created_at_idx on "TournamentAuditLog"("tournamentId", "createdAt")`,
		).run();

		db.prepare(
			/* sql */ `create index tournament_audit_log_tournament_id_team_history_id_type_created_at_idx on "TournamentAuditLog"("tournamentId", "tournamentTeamHistoryId", "type", "createdAt")`,
		).run();

		db.prepare(
			/* sql */ `create index tournament_team_history_tournament_id_idx on "TournamentTeamHistory"("tournamentId")`,
		).run();

		db.pragma("foreign_key_check");
	})();
}
