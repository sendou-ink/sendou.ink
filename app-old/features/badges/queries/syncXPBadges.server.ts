import {
	SPLATOON_3_XP_BADGE_VALUES,
	findSplatoon3XpBadgeValue,
} from "~/constants";
import { sql } from "~/db/sql";
import invariant from "~/utils/invariant";

const badgeCodeToIdStm = sql.prepare(/* sql */ `
  select "id"
    from "Badge"
    where "code" = @code
`);

const deleteBadgeOwnerStm = sql.prepare(/* sql */ `
  delete from "TournamentBadgeOwner"
    where "badgeId" = @badgeId
`);

const userTopXPowersStm = sql.prepare(/* sql */ `
  select
    "SplatoonPlayer"."userId",
    max("XRankPlacement"."power") as "xPower"
  from
    "SplatoonPlayer"
  left join "XRankPlacement" on "XRankPlacement"."playerId" = "SplatoonPlayer"."id"
  where "SplatoonPlayer"."userId" is not null
  group by "SplatoonPlayer"."userId"
`);

const addXPBadgeStm = sql.prepare(/* sql */ `
  insert into "TournamentBadgeOwner" ("badgeId", "userId")
  values (
    (select "id" from "Badge" where "code" = @code),
    @userId
  )
`);

export const syncXPBadges = sql.transaction(() => {
	for (const value of SPLATOON_3_XP_BADGE_VALUES) {
		const badgeId = (badgeCodeToIdStm.get({ code: String(value) }) as any)
			.id as number;

		invariant(badgeId, `Badge ${value} not found`);

		deleteBadgeOwnerStm.run({ badgeId });
	}

	const userTopXPowers = userTopXPowersStm.all() as Array<{
		userId: number;
		xPower: number;
	}>;

	for (const { userId, xPower } of userTopXPowers) {
		const badgeValue = findSplatoon3XpBadgeValue(xPower);
		if (!badgeValue) continue;

		addXPBadgeStm.run({ code: String(badgeValue), userId });
	}
});
