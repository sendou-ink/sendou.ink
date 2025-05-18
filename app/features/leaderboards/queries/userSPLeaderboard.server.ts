import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { ordinalToSp } from "~/features/mmr/mmr-utils";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "../leaderboards-constants";

const stm = sql.prepare(/* sql */ `
  select
    "Skill"."id" as "entryId",
    "Skill"."ordinal",
    "User"."id",
    "User"."username",
    "User"."discordAvatar",
    "User"."discordId",
    "User"."customUrl",
    "User"."plusSkippedForSeasonNth",
    rank () over ( 
      order by "Skill"."Ordinal" desc
    ) "placementRank"
  from 
    "Skill"
    left join "User" on "User"."id" = "Skill"."userId"
    inner join (
      select "userId", max("id") as "maxId"
      from "Skill"
      where "season" = @season
      group by "userId"
    ) "Latest" on "Skill"."userId" = "Latest"."userId" and "Skill"."id" = "Latest"."maxId"
  where
    "Skill"."userId" is not null
    and "Skill"."matchesCount" >= ${MATCHES_COUNT_NEEDED_FOR_LEADERBOARD}
    and "Skill"."season" = @season
  order by
    "Skill"."ordinal" desc
`);

export interface UserSPLeaderboardItem {
	entryId: number;
	power: number;
	id: Tables["User"]["id"];
	username: Tables["User"]["username"];
	discordAvatar: Tables["User"]["discordAvatar"];
	discordId: Tables["User"]["discordId"];
	customUrl: Tables["User"]["customUrl"];
	plusSkippedForSeasonNth: number | null;
	/** Plus tier player is on track to join */
	pendingPlusTier?: Tables["PlusTier"]["tier"];
	placementRank: number;
}

export function userSPLeaderboard(season: number): UserSPLeaderboardItem[] {
	return (stm.all({ season }) as any[]).map(({ ordinal, ...rest }) => ({
		...rest,
		power: ordinalToSp(ordinal),
	}));
}
