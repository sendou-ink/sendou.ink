import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";
import type { MainWeaponId } from "~/modules/in-game-lists";
import { DEFAULT_LEADERBOARD_MAX_SIZE } from "../leaderboards-constants";

const getStm = (where = "") =>
	sql.prepare(/* sql */ `
  select
    "XRankPlacement"."id" as "entryId",
    "XRankPlacement"."playerId",
    "XRankPlacement"."weaponSplId",
    "XRankPlacement"."name",
    "User"."id",
    "User"."username",
    "User"."discordAvatar",
    "User"."discordId",
    "User"."customUrl",
    max("XRankPlacement"."power") as "power",
    rank () over ( 
      order by "power" desc
    ) "placementRank"
  from "XRankPlacement"
  left join "SplatoonPlayer" on "SplatoonPlayer"."id" = "XRankPlacement"."playerId"
  left join "User" on "User"."id" = "SplatoonPlayer"."userId"
  ${where}
  group by "XRankPlacement"."playerId"
  order by "power" desc
  limit ${DEFAULT_LEADERBOARD_MAX_SIZE}
`);

const allStm = getStm();
const modeStm = getStm(/* sql */ `
  where
    "XRankPlacement"."mode" = @mode
`);
const weaponStm = getStm(/* sql */ `
  where
    "XRankPlacement"."weaponSplId" = @weaponSplId
`);

export interface XPLeaderboardItem {
	entryId: number;
	power: number;
	id: Tables["User"]["id"];
	name: Tables["XRankPlacement"]["name"];
	playerId: Tables["XRankPlacement"]["playerId"];
	username: Tables["User"]["username"] | null;
	discordAvatar: Tables["User"]["discordAvatar"] | null;
	discordId: Tables["User"]["discordId"] | null;
	customUrl: Tables["User"]["customUrl"] | null;
	placementRank: number;
	weaponSplId: MainWeaponId;
}

export function allXPLeaderboard(): XPLeaderboardItem[] {
	return allStm.all() as any[];
}

export function modeXPLeaderboard(
	mode: Tables["XRankPlacement"]["mode"],
): XPLeaderboardItem[] {
	return modeStm.all({ mode }) as any[];
}

export function weaponXPLeaderboard(
	weaponSplId: MainWeaponId,
): XPLeaderboardItem[] {
	return weaponStm.all({ weaponSplId }) as any[];
}
