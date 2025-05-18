import { sql } from "~/db/sql";
import type { MainWeaponId } from "~/modules/in-game-lists";

const insertStm = sql.prepare(/* sql */ `
  insert into "ReportedWeapon" 
    ("groupMatchMapId", "weaponSplId", "userId")
  values (@groupMatchMapId, @weaponSplId, @userId)
`);

export const addReportedWeapons = (
	args: {
		groupMatchMapId: number;
		weaponSplId: MainWeaponId;
		userId: number;
	}[],
) => {
	for (const { groupMatchMapId, userId, weaponSplId } of args) {
		insertStm.run({ groupMatchMapId, userId, weaponSplId });
	}
};
