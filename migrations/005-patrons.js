export function up(db) {
	db.prepare(`alter table "User" add column "patronTier" integer`).run();
	db.prepare(`alter table "User" add column "patronSince" integer`).run();

	db.prepare(
		`insert into "Badge" ("code", "displayName") values ('patreon', 'Supporter')`,
	).run();
	db.prepare(
		`insert into "Badge" ("code", "displayName") values ('patreon_plus', 'Supporter+')`,
	).run();

	db.prepare(`alter table "BadgeOwner" rename to "TournamentBadgeOwner"`).run();

	const patreonBadgeId = db
		.prepare(`select "id" from "Badge" where "code" = 'patreon'`)
		.get().id;
	const patreonPlusBadgeId = db
		.prepare(`select "id" from "Badge" where "code" = 'patreon_plus'`)
		.get().id;

	db.prepare(
		`
    create view "BadgeOwner" as
      select "userId", "badgeId" from "TournamentBadgeOwner"
        union all
      select 
        "id" as "userId",
        case
          when "patronTier" = 2 then ${patreonBadgeId}
          else ${patreonPlusBadgeId}
        end "badgeId"
      from "User"
      where "patronTier" > 1
  `,
	).run();
}

export function down(db) {
	db.prepare(`drop view "BadgeOwner"`).run();
	db.prepare(`alter table "User" drop column "patronTier"`).run();
	db.prepare(`alter table "User" drop column "patronSince"`).run();

	db.prepare(
		`delete from "Badge" where "code" in ('patreon_plus', 'patreon')`,
	).run();

	db.prepare(`alter table "TournamentBadgeOwner" rename to "BadgeOwner"`).run();
}
