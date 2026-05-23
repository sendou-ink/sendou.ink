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
					"userId" integer not null,
					"createdAt" integer default (strftime('%s', 'now')) not null,
					foreign key ("groupMatchId") references "GroupMatch"("id") on delete cascade,
					foreign key ("tournamentMatchId") references "TournamentMatch"("id") on delete cascade,
					foreign key ("userId") references "User"("id") on delete restrict,
					unique("groupMatchId", "mapIndex", "userId") on conflict rollback,
					unique("tournamentMatchId", "mapIndex", "userId") on conflict rollback,
					check (("groupMatchId" is not null) <> ("tournamentMatchId" is not null))
				) strict
			`,
		).run();

		db.prepare(
			/* sql */ `
				insert into "ReportedWeapon_new"
					("groupMatchId", "tournamentMatchId", "mapIndex", "weaponSplId", "userId", "createdAt")
				select
					"rw"."groupMatchId",
					"rw"."tournamentMatchId",
					"rw"."mapIndex",
					"rw"."weaponSplId",
					"rw"."userId",
					case
						when "rw"."groupMatchId" is not null then (
							select "GroupMatch"."createdAt"
							from "GroupMatch"
							where "GroupMatch"."id" = "rw"."groupMatchId"
						)
						else coalesce(
							(
								select min("CalendarEventDate"."startTime")
								from "CalendarEventDate"
								inner join "CalendarEvent"
									on "CalendarEvent"."id" = "CalendarEventDate"."eventId"
								inner join "Tournament"
									on "Tournament"."id" = "CalendarEvent"."tournamentId"
								inner join "TournamentStage"
									on "TournamentStage"."tournamentId" = "Tournament"."id"
								inner join "TournamentMatch"
									on "TournamentMatch"."stageId" = "TournamentStage"."id"
								where "TournamentMatch"."id" = "rw"."tournamentMatchId"
							),
							strftime('%s', 'now')
						)
					end
				from "ReportedWeapon" as "rw"
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

		db.pragma("foreign_key_check");
	})();

	db.pragma("foreign_keys = ON");
}
