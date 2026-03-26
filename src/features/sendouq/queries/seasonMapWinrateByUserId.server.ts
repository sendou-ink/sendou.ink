import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  select
    sum("wins") as "wins",
    sum("losses") as "losses"
  from
    "MapResult"
  where
    "userId" = @userId
    and "season" = @season
  group by
    "userId"
`);

export function seasonMapWinrateByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}): { wins: number; losses: number } {
	return stm.get({ userId, season }) as any;
}
