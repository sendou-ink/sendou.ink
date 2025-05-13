import { sql } from "~/db/sql";
import * as Seasons from "~/features/mmr/core/Seasons";
import type { MainWeaponId } from "~/modules/in-game-lists";
import { dateToDatabaseTimestamp } from "~/utils/dates";

const stm = sql.prepare(/* sql */ `
  select
    "ReportedWeapon"."weaponSplId",
    count(*) as "count"
  from
    "ReportedWeapon"
  left join "GroupMatchMap" on "GroupMatchMap"."id" = "ReportedWeapon"."groupMatchMapId"
  left join "GroupMatch" on "GroupMatch"."id" = "GroupMatchMap"."matchId"
  where
    "ReportedWeapon"."userId" = @userId
    and "GroupMatch"."createdAt" between @starts and @ends
  group by "ReportedWeapon"."weaponSplId"
  order by "count" desc
`);

export function seasonReportedWeaponsByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}) {
	const { starts, ends } = Seasons.nthToDateRange(season);

	return stm.all({
		userId,
		starts: dateToDatabaseTimestamp(starts),
		ends: dateToDatabaseTimestamp(ends),
	}) as Array<{ weaponSplId: MainWeaponId; count: number }>;
}
