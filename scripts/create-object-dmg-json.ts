// @ts-nocheck

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DAMAGE_RECEIVERS } from "~/features/object-damage-calculator/calculator-constants";
import {
	mainWeaponIds,
	specialWeaponIds,
	subWeaponIds,
} from "~/modules/in-game-lists/weapon-ids";
// 1) WeaponInfoMain.json inside dicts
// 2) WeaponInfoSub.json inside dicts
// 3) WeaponInfoSpecial.json inside dicts
// 4) misc/spl__DamageRateInfoConfig.pp__CombinationDataTableData.json
import params from "./dicts/spl__DamageRateInfoConfig.pp__CombinationDataTableData.json";
import weapons from "./dicts/WeaponInfoMain.json";
import specialWeapons from "./dicts/WeaponInfoSpecial.json";
import subWeapons from "./dicts/WeaponInfoSub.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR_PATH = path.join(__dirname, "output");

const weaponParamsToWeaponIds = (
	params: typeof weapons | typeof subWeapons | typeof specialWeapons,
	key: string,
) => {
	return params
		.filter((param) => {
			return (
				param.DefaultDamageRateInfoRow === key ||
				param.ExtraDamageRateInfoRowSet?.some(
					(row) => row.DamageRateInfoRow === key,
				)
			);
		})
		.map((weapon) => weapon.Id);
};

const result = {};
for (const cell of Object.values(params.CellList)) {
	if (!DAMAGE_RECEIVERS.includes(cell.ColumnKey)) continue;
	if (!cell.DamageRate) continue;

	if (!result[cell.RowKey]) {
		result[cell.RowKey] = {
			mainWeaponIds: weaponParamsToWeaponIds(weapons, cell.RowKey).filter(
				(id) => mainWeaponIds.includes(id),
			),
			subWeaponIds: weaponParamsToWeaponIds(subWeapons, cell.RowKey).filter(
				(id) => subWeaponIds.includes(id),
			),
			specialWeaponIds: weaponParamsToWeaponIds(
				specialWeapons,
				cell.RowKey,
			).filter((id) => specialWeaponIds.includes(id)),
			rates: [],
		};
	}

	// if it applies to no PvP weapons, we don't care about it
	if (
		result[cell.RowKey].mainWeaponIds.length === 0 &&
		result[cell.RowKey].subWeaponIds.length === 0 &&
		result[cell.RowKey].specialWeaponIds.length === 0 &&
		cell.RowKey !== "ObjectEffect_Up"
	) {
		result[cell.RowKey] = undefined;
		continue;
	}

	result[cell.RowKey].rates.push({
		target: cell.ColumnKey,
		rate: cell.DamageRate,
	});

	// add a second rate for launched versions, since they have double health
	if (
		cell.ColumnKey.includes("BulletUmbrellaCanopyNormal") ||
		cell.ColumnKey.includes("BulletUmbrellaCanopyWide")
	) {
		result[cell.RowKey].rates.push({
			target: `${cell.ColumnKey}_Launched`,
			rate: cell.DamageRate,
		});
	}

	// if it has special damage rates for Splat Brella, add the same value for Recycled Brella
	if (cell.ColumnKey === "BulletUmbrellaCanopyNormal") {
		result[cell.RowKey].rates.push({
			target: "BulletShelterCanopyFocus",
			rate: cell.DamageRate,
		});

		result[cell.RowKey].rates.push({
			target: "BulletShelterCanopyFocus_Launched",
			rate: cell.DamageRate,
		});
	}
}

fs.writeFileSync(
	path.join(OUTPUT_DIR_PATH, "object-dmg.json"),
	JSON.stringify(result, null, 2),
);
