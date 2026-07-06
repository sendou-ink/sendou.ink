export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
				create table "IngestedEvent" (
					"id" integer primary key,
					"tournamentId" integer,
					"povUserId" integer,
					"submitterUserId" integer,
					"type" text not null,
					"t" real not null,
					"confidence" real not null,
					"data" text not null,
					"detectedAt" integer,
					"eventHash" text unique not null,
					"createdAt" integer default (strftime('%s', 'now')) not null,
					foreign key ("tournamentId") references "Tournament"("id") on delete cascade,
					foreign key ("povUserId") references "User"("id") on delete set null,
					foreign key ("submitterUserId") references "User"("id") on delete set null
				) strict
			`,
		).run();

		db.prepare(
			/* sql */ `create index ingested_event_tournament_id on "IngestedEvent"("tournamentId")`,
		).run();

		db.prepare(
			/* sql */ `create index ingested_event_pov_user_id on "IngestedEvent"("povUserId")`,
		).run();

		db.prepare(
			/* sql */ `
				create table "IngestedScoreboard" (
					"id" integer primary key,
					"matchGameResultId" integer not null unique,
					"data" text not null,
					"createdAt" integer default (strftime('%s', 'now')) not null,
					foreign key ("matchGameResultId") references "TournamentMatchGameResult"("id") on delete cascade
				) strict
			`,
		).run();
	})();
}
