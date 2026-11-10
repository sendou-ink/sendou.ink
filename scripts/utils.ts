import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { invariant } from "~/utils/invariant";
import type {
	DamageRateInfoConfig,
	GearInfoEntry,
	LangDict,
	SplPlayerParams,
	WeaponInfoMainEntry,
	WeaponInfoSpecialEntry,
	WeaponInfoSubEntry,
} from "./splat3-types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SPLAT3_DATA_PATH = path.join(__dirname, "dicts", "splat3", "data");

/** Latest released season, gear and weapons from later seasons are left out of the generated data. */
export const CURRENT_SEASON = 9;

/** Weapon dump `Type`s (and `__RowId` fragments for subs/specials) that aren't usable in versus. */
export const WEAPON_TYPES_TO_IGNORE = [
	"Mission",
	"Coop",
	"Hero",
	"Rival",
	"SalmonBuddy",
	"Sdodr",
];

const INTERNAL_MAIN_WEAPON_NAMES_TO_IGNORE = ["Free"];

/** Per-version weapon/sub/special `GameParameterTable` dumps, keyed by patch version folder. */
export const PARAMETER_DIR = path.join(SPLAT3_DATA_PATH, "parameter");
/** Per-version `WeaponInfo`/`GearInfo` dumps, keyed by patch version folder. */
export const MUSH_DIR = path.join(SPLAT3_DATA_PATH, "mush");

const LANG_DICTS_PATH = path.join(SPLAT3_DATA_PATH, "language");

export const LANG_JSONS_TO_CREATE = [
	"EUen",
	"CNzh",
	"EUde",
	"EUes",
	"USes",
	"EUfr",
	"EUit",
	"EUnl",
	"EUru",
	"JPja",
	"KRko",
	"USfr",
];

export async function loadLangDicts() {
	const result: Array<[langCode: string, translations: LangDict]> = [];

	const files = await fs.promises.readdir(LANG_DICTS_PATH);
	for (const file of files) {
		if (file === ".gitkeep") continue;

		const translations = JSON.parse(
			fs.readFileSync(path.join(LANG_DICTS_PATH, file), "utf8"),
		);

		result.push([file.replace(".json", ""), translations]);
	}

	return result;
}

export function translationJsonFolderName(langCode: string) {
	if (langCode === "EUes") return "es-ES";
	if (langCode === "USes") return "es-US";
	if (langCode === "EUfr") return "fr-EU";
	if (langCode === "USfr") return "fr-CA";
	return langCode.slice(2);
}

/** Latest-version directory holding the per-weapon `GameParameterTable` dumps. */
export function weaponParamsDir() {
	return path.join(PARAMETER_DIR, "latest", "weapon");
}

/** Whether a `WeaponInfoMain` entry is left out of the generated weapon data (non-versus or not yet released). */
export function mainWeaponShouldBeSkipped(mainWeapon: {
	Type: string;
	__RowId: string;
	Season: number;
}) {
	return (
		WEAPON_TYPES_TO_IGNORE.includes(mainWeapon.Type) ||
		INTERNAL_MAIN_WEAPON_NAMES_TO_IGNORE.includes(mainWeapon.__RowId) ||
		mainWeapon.Season > CURRENT_SEASON
	);
}

/** File name of a weapon's `GameParameterTable` dump, e.g. `Shooter_Short_00` → `WeaponShooterShort.game__GameParameterTable.json`. */
export function weaponRowIdToFileName(rowId: string) {
	const [category, codeName] = rowId.split("_");
	invariant(category);

	return `Weapon${category}${codeName ?? ""}.game__GameParameterTable.json`;
}

export const loadWeaponInfoMain = () =>
	loadLatestMushJson<WeaponInfoMainEntry[]>("WeaponInfoMain");
export const loadWeaponInfoSub = () =>
	loadLatestMushJson<WeaponInfoSubEntry[]>("WeaponInfoSub");
export const loadWeaponInfoSpecial = () =>
	loadLatestMushJson<WeaponInfoSpecialEntry[]>("WeaponInfoSpecial");
export const loadGearInfoClothes = () =>
	loadLatestMushJson<GearInfoEntry[]>("GearInfoClothes");
export const loadGearInfoHead = () =>
	loadLatestMushJson<GearInfoEntry[]>("GearInfoHead");
export const loadGearInfoShoes = () =>
	loadLatestMushJson<GearInfoEntry[]>("GearInfoShoes");
export const loadSplPlayerParams = () =>
	loadLatestParameterMiscJson<SplPlayerParams>(
		"SplPlayer.game__GameParameterTable",
	);
export const loadDamageRateInfo = () =>
	loadLatestParameterMiscJson<DamageRateInfoConfig>(
		"spl__DamageRateInfoConfig.pp__CombinationDataTableData",
	);

function loadLatestMushJson<T>(fileName: string): T {
	return JSON.parse(
		fs.readFileSync(path.join(MUSH_DIR, "latest", `${fileName}.json`), "utf8"),
	);
}

function loadLatestParameterMiscJson<T>(fileName: string): T {
	return JSON.parse(
		fs.readFileSync(
			path.join(PARAMETER_DIR, "latest", "misc", `${fileName}.json`),
			"utf8",
		),
	);
}
