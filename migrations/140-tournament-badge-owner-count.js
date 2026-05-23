export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "TournamentBadgeOwner" add column "count" integer not null default 1`,
		).run();

		db.prepare(
			/* sql */ `
				update "TournamentBadgeOwner"
				set "count" = (
					select count(*) from "TournamentBadgeOwner" t2
					where t2."userId" = "TournamentBadgeOwner"."userId"
						and t2."badgeId" = "TournamentBadgeOwner"."badgeId"
						and t2."tournamentId" is null
				)
				where rowid in (
					select min(rowid) from "TournamentBadgeOwner"
					where "tournamentId" is null
					group by "userId", "badgeId"
				)
			`,
		).run();

		db.prepare(
			/* sql */ `
				delete from "TournamentBadgeOwner"
				where "tournamentId" is null
					and rowid not in (
						select min(rowid) from "TournamentBadgeOwner"
						where "tournamentId" is null
						group by "userId", "badgeId"
					)
			`,
		).run();

		db.prepare(/* sql */ `drop view "BadgeOwner"`).run();

		db.prepare(
			/* sql */ `
				create view "BadgeOwner" as
				select "userId", "badgeId", "count" from "TournamentBadgeOwner"
				union all
				select
					"id" as "userId",
					case when "patronTier" = 2 then 40 else 41 end as "badgeId",
					1 as "count"
				from "User"
				where "patronTier" > 1
			`,
		).run();

		db.prepare(
			/* sql */ `create index tournament_badge_owner_user_id on "TournamentBadgeOwner"("userId")`,
		).run();
	})();
}
