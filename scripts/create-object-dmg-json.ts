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
// To run this script drop the https://github.com/Leanny/splat3 repo into scripts/dicts/splat3
import {
	loadDamageRateInfo,
	loadWeaponInfoMain,
	loadWeaponInfoSpecial,
	loadWeaponInfoSub,
	PARAMETER_DIR,
} from "./utils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const params = loadDamageRateInfo();
const weapons = loadWeaponInfoMain();
const subWeapons = loadWeaponInfoSub();
const specialWeapons = loadWeaponInfoSpecial();

const OUTPUT_DIR_PATH = path.join(__dirname, "output");
const DAMAGE_RATE_CONFIG_FILE_NAME =
	"spl__DamageRateInfoConfig.pp__CombinationDataTableData.json";
const HISTORY_OUTPUT_PATH = path.join(
	__dirname,
	"..",
	"app",
	"features",
	"params",
	"data",
	"damage-rate-history.json",
);

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

type DamageRateConfig = { CellList: Record<string, DamageRateCell> };

type TargetHistory = {
	target: string;
	current: number;
	history: Array<{ version: string; value: number }>;
};

type DamageRateHistoryRow = {
	mainWeaponIds: MainWeaponId[];
	subWeaponIds: SubWeaponId[];
	specialWeaponIds: SpecialWeaponId[];
	targets: TargetHistory[];
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

const mainIdsForRow = (rowKey: string) =>
	weaponParamsToWeaponIds(weapons, rowKey).filter((id): id is MainWeaponId =>
		(mainWeaponIds as readonly number[]).includes(id),
	);
const subIdsForRow = (rowKey: string) =>
	weaponParamsToWeaponIds(subWeapons, rowKey).filter((id): id is SubWeaponId =>
		(subWeaponIds as readonly number[]).includes(id),
	);
const specialIdsForRow = (rowKey: string) =>
	weaponParamsToWeaponIds(specialWeapons, rowKey).filter(
		(id): id is SpecialWeaponId =>
			(specialWeaponIds as readonly number[]).includes(id),
	);

/**
 * Resolves the per-target damage rate of every damage rate info row in a single config dump.
 * Only the PvP-relevant receivers are kept and the synthetic launched/Recycled Brella canopy
 * targets are derived the same way the live object damage calculator expects them.
 */
const damageRatesByRow = (
	config: DamageRateConfig,
): Map<string, Map<string, number>> => {
	const result = new Map<string, Map<string, number>>();

	for (const cell of Object.values(config.CellList)) {
		if (!isDamageReceiver(cell.ColumnKey)) continue;
		if (!cell.DamageRate) continue;

		let row = result.get(cell.RowKey);
		if (!row) {
			row = new Map();
			result.set(cell.RowKey, row);
		}

		row.set(cell.ColumnKey, cell.DamageRate);

		// launched versions have double health but share the same rate
		if (
			cell.ColumnKey.includes("BulletUmbrellaCanopyNormal") ||
			cell.ColumnKey.includes("BulletUmbrellaCanopyWide")
		) {
			row.set(`${cell.ColumnKey}_Launched`, cell.DamageRate);
		}

		// Recycled Brella reuses Splat Brella's special damage rates
		if (cell.ColumnKey === "BulletUmbrellaCanopyNormal") {
			row.set("BulletShelterCanopyFocus", cell.DamageRate);
			row.set("BulletShelterCanopyFocus_Launched", cell.DamageRate);
		}
	}

	return result;
};

const result: Record<string, ResultEntry | undefined> = {};
for (const [rowKey, rates] of damageRatesByRow(params)) {
	const mainWeaponIdsForRow = mainIdsForRow(rowKey);
	const subWeaponIdsForRow = subIdsForRow(rowKey);
	const specialWeaponIdsForRow = specialIdsForRow(rowKey);

	// if it applies to no PvP weapons, we don't care about it
	if (
		mainWeaponIdsForRow.length === 0 &&
		subWeaponIdsForRow.length === 0 &&
		specialWeaponIdsForRow.length === 0 &&
		rowKey !== "ObjectEffect_Up"
	) {
		continue;
	}

	result[rowKey] = {
		mainWeaponIds: mainWeaponIdsForRow,
		subWeaponIds: subWeaponIdsForRow,
		specialWeaponIds: specialWeaponIdsForRow,
		rates: [...rates].map(([target, rate]) => ({ target, rate })),
	};
}

fs.writeFileSync(
	path.join(OUTPUT_DIR_PATH, "object-dmg.json"),
	JSON.stringify(result, null, 2),
);

writeDamageRateHistory();

function versionDirToDisplay(version: string): string {
	const num = Number.parseInt(version, 10);
	const major = Math.floor(num / 100);
	const minor = Math.floor((num % 100) / 10);
	const patch = num % 10;
	return `${major}.${minor}.${patch}`;
}

/**
 * Builds the per-row, per-target damage rate history across every versioned config dump and
 * writes it for the params page to surface in its patch history. Only PvP-relevant rows and
 * only targets whose rate actually changed at some point are kept, so the output stays small.
 */
function writeDamageRateHistory() {
	const versionDirs = fs
		.readdirSync(PARAMETER_DIR)
		.filter((dir) => /^\d+$/.test(dir))
		.sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

	const ratesByVersion = new Map<string, Map<string, Map<string, number>>>();
	for (const version of versionDirs) {
		const filePath = path.join(
			PARAMETER_DIR,
			version,
			"misc",
			DAMAGE_RATE_CONFIG_FILE_NAME,
		);
		if (!fs.existsSync(filePath)) continue;

		const config = JSON.parse(
			fs.readFileSync(filePath, "utf8"),
		) as DamageRateConfig;
		ratesByVersion.set(version, damageRatesByRow(config));
	}

	const presentVersions = versionDirs.filter((version) =>
		ratesByVersion.has(version),
	);
	const latestVersion = presentVersions[presentVersions.length - 1];

	const rows: Record<string, DamageRateHistoryRow> = {};
	for (const [rowKey, latestRates] of ratesByVersion.get(latestVersion) ?? []) {
		const mainWeaponIdsForRow = mainIdsForRow(rowKey);
		const subWeaponIdsForRow = subIdsForRow(rowKey);
		const specialWeaponIdsForRow = specialIdsForRow(rowKey);

		if (
			mainWeaponIdsForRow.length === 0 &&
			subWeaponIdsForRow.length === 0 &&
			specialWeaponIdsForRow.length === 0
		) {
			continue;
		}

		const targets: TargetHistory[] = [];
		for (const [target, current] of latestRates) {
			const presentForTarget = presentVersions.filter(
				(version) =>
					ratesByVersion.get(version)?.get(rowKey)?.get(target) !== undefined,
			);

			const history: Array<{ version: string; value: number }> = [];
			for (let i = 0; i < presentForTarget.length - 1; i++) {
				const value = ratesByVersion
					.get(presentForTarget[i])!
					.get(rowKey)!
					.get(target)!;
				const nextValue = ratesByVersion
					.get(presentForTarget[i + 1])!
					.get(rowKey)!
					.get(target)!;
				if (value !== nextValue) {
					history.push({
						version: versionDirToDisplay(presentForTarget[i]),
						value,
					});
				}
			}

			if (history.length > 0) {
				targets.push({ target, current, history });
			}
		}

		if (targets.length > 0) {
			rows[rowKey] = {
				mainWeaponIds: mainWeaponIdsForRow,
				subWeaponIds: subWeaponIdsForRow,
				specialWeaponIds: specialWeaponIdsForRow,
				targets,
			};
		}
	}

	fs.writeFileSync(
		HISTORY_OUTPUT_PATH,
		JSON.stringify(
			{
				metadata: { versions: presentVersions.map(versionDirToDisplay) },
				rows,
			},
			null,
			2,
		),
	);
}
