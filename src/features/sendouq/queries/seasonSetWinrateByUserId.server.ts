import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  select
    (sum("setWins") / 4) as "wins",
    (sum("setLosses") / 4) as "losses"
  from
    "PlayerResult"
  where
    "ownerUserId" = @userId
    and "season" = @season
    and "type" = 'ENEMY'
  group by
    "ownerUserId"
`);

export function seasonSetWinrateByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}): { wins: number; losses: number } {
	return stm.get({ userId, season }) as any;
}
