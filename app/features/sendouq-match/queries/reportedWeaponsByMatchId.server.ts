import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

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
		Tables["ReportedWeapon"] & {
			mapIndex: Tables["GroupMatchMap"]["index"];
			groupMatchMapId: number;
		}
	>;

	if (rows.length === 0) return null;

	return rows;
}
