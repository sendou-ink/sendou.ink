export function up(db) {
	db.pragma("foreign_keys = OFF");

	db.transaction(() => {
		db.prepare(
			/* sql */ `
				create table "ReportedWeapon_new" (
					"groupMatchId" integer,
					"tournamentMatchId" integer,
					"mapIndex" integer not null,
					"weaponSplId" integer not null,
					"userId" integer,
					"ingestedInGameName" text,
					"ingestedTeamId" integer,
					"createdAt" integer default (strftime('%s', 'now')) not null,
					foreign key ("groupMatchId") references "GroupMatch"("id") on delete cascade,
					foreign key ("tournamentMatchId") references "TournamentMatch"("id") on delete cascade,
					foreign key ("userId") references "User"("id") on delete restrict,
					foreign key ("ingestedTeamId") references "TournamentTeam"("id") on delete set null,
					unique("groupMatchId", "mapIndex", "userId") on conflict rollback,
					unique("tournamentMatchId", "mapIndex", "userId") on conflict rollback,
					check (("groupMatchId" is not null) <> ("tournamentMatchId" is not null)),
					check ("userId" is not null or "ingestedInGameName" is not null)
				) strict
			`,
		).run();

		db.prepare(
			/* sql */ `
				insert into "ReportedWeapon_new"
					("groupMatchId", "tournamentMatchId", "mapIndex", "weaponSplId", "userId", "createdAt")
				select
					"groupMatchId",
					"tournamentMatchId",
					"mapIndex",
					"weaponSplId",
					"userId",
					"createdAt"
				from "ReportedWeapon"
			`,
		).run();

		db.prepare(/* sql */ `drop table "ReportedWeapon"`).run();

		db.prepare(
			/* sql */ `alter table "ReportedWeapon_new" rename to "ReportedWeapon"`,
		).run();

		db.prepare(
			/* sql */ `create index reported_weapon_group_match_id on "ReportedWeapon"("groupMatchId")`,
		).run();

		db.prepare(
			/* sql */ `create index reported_weapon_tournament_match_id on "ReportedWeapon"("tournamentMatchId")`,
		).run();

		db.prepare(
			/* sql */ `create index reported_weapon_user_id on "ReportedWeapon"("userId")`,
		).run();

		db.prepare(
			/* sql */ `create index reported_weapon_user_created_at_weapon on "ReportedWeapon"("userId", "createdAt", "weaponSplId")`,
		).run();

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

		db.pragma("foreign_key_check");
	})();

	db.pragma("foreign_keys = ON");
}
