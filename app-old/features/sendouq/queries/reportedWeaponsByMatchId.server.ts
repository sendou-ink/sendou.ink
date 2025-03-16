import { sql } from "~/db/sql";
import type { GroupMatchMap, ReportedWeapon } from "~/db/types";

const stm = sql.prepare(/* sql */ `
  select
    "ReportedWeapon"."groupMatchMapId",
    "ReportedWeapon"."weaponSplId",
    "ReportedWeapon"."userId",
    "GroupMatchMap"."index" as "mapIndex"
  from
    "ReportedWeapon"
  left join "GroupMatchMap" on "GroupMatchMap"."id" = "ReportedWeapon"."groupMatchMapId"
  where "GroupMatchMap"."matchId" = @matchId
`);

export function reportedWeaponsByMatchId(matchId: number) {
	const rows = stm.all({ matchId }) as Array<
		ReportedWeapon & {
			mapIndex: GroupMatchMap["index"];
			groupMatchMapId: number;
		}
	>;

	if (rows.length === 0) return null;

	return rows;
}
