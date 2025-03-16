import { sql } from "~/db/sql";
import type { User, XRankPlacement } from "~/db/types";

const query = (byPlayer?: boolean) => /* sql */ `
  select
    "XRankPlacement"."id",
    "XRankPlacement"."weaponSplId",
    "XRankPlacement"."name",
    "XRankPlacement"."power",
    "XRankPlacement"."rank",
    "XRankPlacement"."month",
    "XRankPlacement"."year",
    "XRankPlacement"."region",
    "XRankPlacement"."playerId",
    "XRankPlacement"."month", 
    "XRankPlacement"."year", 
    "XRankPlacement"."mode",
    "User"."discordId",
    "User"."customUrl"
  from
    "XRankPlacement"
  left join "SplatoonPlayer" on
    "SplatoonPlayer"."id" = "XRankPlacement"."playerId"
  left join "User" on
    "User"."id" = "SplatoonPlayer"."userId"
  ${
		byPlayer
			? /* sql */ `
  where
    "XRankPlacement"."playerId" = @playerId
  order by
    "XRankPlacement"."year" desc,
    "XRankPlacement"."month" desc,
    "XRankPlacement"."rank" asc
        `
			: /* sql */ `
  where
    "XRankPlacement"."mode" = @mode and
    "XRankPlacement"."region" = @region and
    "XRankPlacement"."month" = @month and
    "XRankPlacement"."year" = @year
  order by
    "XRankPlacement"."rank" asc`
	}
`;

const ofMonthStm = sql.prepare(query());
const byPlayerStm = sql.prepare(query(true));

export type FindPlacement = Pick<
	XRankPlacement,
	| "id"
	| "weaponSplId"
	| "name"
	| "power"
	| "rank"
	| "month"
	| "year"
	| "region"
	| "playerId"
	| "mode"
> &
	Pick<User, "customUrl" | "discordId">;

export function findPlacementsOfMonth(
	args: Pick<XRankPlacement, "mode" | "region" | "month" | "year">,
) {
	return ofMonthStm.all(args) as Array<FindPlacement>;
}

export function findPlacementsByPlayerId(playerId: XRankPlacement["playerId"]) {
	const results = byPlayerStm.all({ playerId }) as Array<FindPlacement>;
	if (!results) return null;

	return results;
}
