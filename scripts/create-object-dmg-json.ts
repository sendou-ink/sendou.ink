import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DAMAGE_RECEIVERS } from "~/features/object-damage-calculator/calculator-constants";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
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

type DamageReceiver = (typeof DAMAGE_RECEIVERS)[number];

type ResultEntry = {
	mainWeaponIds: MainWeaponId[];
	subWeaponIds: SubWeaponId[];
	specialWeaponIds: SpecialWeaponId[];
	rates: { target: string; rate: number }[];
};

type DamageRateCell = {
	ColumnKey: string;
	RowKey: string;
	DamageRate?: number;
};

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

const isDamageReceiver = (key: string): key is DamageReceiver =>
	(DAMAGE_RECEIVERS as readonly string[]).includes(key);

const result: Record<string, ResultEntry | undefined> = {};
for (const cell of Object.values(params.CellList) as DamageRateCell[]) {
	if (!isDamageReceiver(cell.ColumnKey)) continue;
	if (!cell.DamageRate) continue;

	if (!result[cell.RowKey]) {
		result[cell.RowKey] = {
			mainWeaponIds: weaponParamsToWeaponIds(weapons, cell.RowKey).filter(
				(id): id is MainWeaponId =>
					(mainWeaponIds as readonly number[]).includes(id),
			),
			subWeaponIds: weaponParamsToWeaponIds(subWeapons, cell.RowKey).filter(
				(id): id is SubWeaponId =>
					(subWeaponIds as readonly number[]).includes(id),
			),
			specialWeaponIds: weaponParamsToWeaponIds(
				specialWeapons,
				cell.RowKey,
			).filter((id): id is SpecialWeaponId =>
				(specialWeaponIds as readonly number[]).includes(id),
			),
			rates: [],
		};
	}

	const entry = result[cell.RowKey]!;

	// if it applies to no PvP weapons, we don't care about it
	if (
		entry.mainWeaponIds.length === 0 &&
		entry.subWeaponIds.length === 0 &&
		entry.specialWeaponIds.length === 0 &&
		cell.RowKey !== "ObjectEffect_Up"
	) {
		result[cell.RowKey] = undefined;
		continue;
	}

	entry.rates.push({
		target: cell.ColumnKey,
		rate: cell.DamageRate,
	});

	// add a second rate for launched versions, since they have double health
	if (
		cell.ColumnKey.includes("BulletUmbrellaCanopyNormal") ||
		cell.ColumnKey.includes("BulletUmbrellaCanopyWide")
	) {
		entry.rates.push({
			target: `${cell.ColumnKey}_Launched`,
			rate: cell.DamageRate,
		});
	}

	// if it has special damage rates for Splat Brella, add the same value for Recycled Brella
	if (cell.ColumnKey === "BulletUmbrellaCanopyNormal") {
		entry.rates.push({
			target: "BulletShelterCanopyFocus",
			rate: cell.DamageRate,
		});

		entry.rates.push({
			target: "BulletShelterCanopyFocus_Launched",
			rate: cell.DamageRate,
		});
	}
}

fs.writeFileSync(
	path.join(OUTPUT_DIR_PATH, "object-dmg.json"),
	JSON.stringify(result, null, 2),
);
