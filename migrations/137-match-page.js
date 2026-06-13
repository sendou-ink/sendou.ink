export function up(db) {
	db.pragma("foreign_keys = OFF");

	db.transaction(() => {
		db.prepare(
			/* sql */ `
      create table "RoomLink" (
        "userId" integer not null unique,
        "url" text not null,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        "refreshedAt" integer default (strftime('%s', 'now')) not null,
        foreign key ("userId") references "User"("id") on delete cascade
      ) strict
      `,
		).run();

		db.prepare(
			/* sql */ `alter table "User" add "noSplatnet" integer default 0 not null`,
		).run();

		db.prepare(
			/* sql */ `alter table "Group" add "matchmade" integer default 0 not null`,
		).run();

		db.prepare(
			/* sql */ `alter table "GroupMatchMap" add "reportedAt" integer`,
		).run();

		db.prepare(
			/* sql */ `alter table "GroupMatchMap" add "reportedByUserId" integer references "User"("id")`,
		).run();

		db.prepare(
			/* sql */ `
        update "GroupMatchMap"
        set
          "reportedAt" = (
            select "reportedAt" from "GroupMatch"
            where "GroupMatch"."id" = "GroupMatchMap"."matchId"
          ),
          "reportedByUserId" = (
            select "reportedByUserId" from "GroupMatch"
            where "GroupMatch"."id" = "GroupMatchMap"."matchId"
          )
        where "winnerGroupId" is not null
      `,
		).run();

		db.prepare(
			/* sql */ `
        create table "GroupMatch_new" (
          "id" integer primary key,
          "alphaGroupId" integer not null,
          "bravoGroupId" integer not null,
          "createdAt" integer default (strftime('%s', 'now')) not null,
          "chatCode" text,
          "memento" text,
          "confirmedAt" integer,
          "confirmedByUserId" integer references "User"("id"),
          "cancelRequestedByUserId" integer references "User"("id"),
          "cancelAcceptedByUserId" integer references "User"("id"),
          foreign key ("alphaGroupId") references "Group"("id") on delete restrict,
          foreign key ("bravoGroupId") references "Group"("id") on delete restrict,
          unique("alphaGroupId") on conflict rollback,
          unique("bravoGroupId") on conflict rollback
        ) strict
      `,
		).run();

		db.prepare(
			/* sql */ `
        insert into "GroupMatch_new" (
          "id", "alphaGroupId", "bravoGroupId", "createdAt", "chatCode", "memento"
        )
        select
          "id", "alphaGroupId", "bravoGroupId", "createdAt", "chatCode", "memento"
        from "GroupMatch"
      `,
		).run();

		db.prepare(/* sql */ `drop table "GroupMatch"`).run();
		db.prepare(
			/* sql */ `alter table "GroupMatch_new" rename to "GroupMatch"`,
		).run();

		db.prepare(
			/* sql */ `create index group_match_alpha_group_id on "GroupMatch"("alphaGroupId")`,
		).run();
		db.prepare(
			/* sql */ `create index group_match_bravo_group_id on "GroupMatch"("bravoGroupId")`,
		).run();
		db.prepare(
			/* sql */ `create index group_match_created_at on "GroupMatch"("createdAt")`,
		).run();
		db.prepare(
			/* sql */ `create index group_match_confirmed_at on "GroupMatch"("confirmedAt")`,
		).run();

		db.prepare(
			/* sql */ `create index group_match_map_reported_at on "GroupMatchMap"("reportedAt")`,
		).run();

		db.prepare(
			/* sql */ `
        create table "GroupMatchContinueVote" (
          "id" integer primary key,
          "groupId" integer not null,
          "userId" integer not null,
          "isContinuing" integer not null check ("isContinuing" in (0, 1)),
          "votedAt" integer default (strftime('%s', 'now')) not null,
          foreign key ("groupId") references "Group"("id") on delete cascade,
          foreign key ("userId") references "User"("id") on delete cascade,
          unique("groupId", "userId")
        ) strict
      `,
		).run();

		db.prepare(
			/* sql */ `create index group_match_continue_vote_group_id on "GroupMatchContinueVote"("groupId")`,
		).run();

		db.prepare(
			/* sql */ `
        create table "ReportedWeapon_new" (
          "groupMatchId" integer,
          "tournamentMatchId" integer,
          "mapIndex" integer not null,
          "weaponSplId" integer not null,
          "userId" integer not null,
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
        insert into "ReportedWeapon_new" (
          "groupMatchId", "tournamentMatchId", "mapIndex", "weaponSplId", "userId"
        )
        select
          "GroupMatchMap"."matchId", null, "GroupMatchMap"."index",
          "ReportedWeapon"."weaponSplId", "ReportedWeapon"."userId"
        from "ReportedWeapon"
        inner join "GroupMatchMap" on "GroupMatchMap"."id" = "ReportedWeapon"."groupMatchMapId"
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

		db.pragma("foreign_key_check");
	})();

	db.pragma("foreign_keys = ON");
}
