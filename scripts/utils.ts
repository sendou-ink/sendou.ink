import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type euEn from "./dicts/splat3/data/language/EUen.json";
// The splat3 dump exposes a `latest` symlink to the newest version folder, so these loaders never
// need to hard-code a version.
import type gearInfoClothes from "./dicts/splat3/data/mush/latest/GearInfoClothes.json";
import type gearInfoHead from "./dicts/splat3/data/mush/latest/GearInfoHead.json";
import type gearInfoShoes from "./dicts/splat3/data/mush/latest/GearInfoShoes.json";
import type weaponInfoMain from "./dicts/splat3/data/mush/latest/WeaponInfoMain.json";
import type weaponInfoSpecial from "./dicts/splat3/data/mush/latest/WeaponInfoSpecial.json";
import type weaponInfoSub from "./dicts/splat3/data/mush/latest/WeaponInfoSub.json";
import type splPlayer from "./dicts/splat3/data/parameter/latest/misc/SplPlayer.game__GameParameterTable.json";
import type damageRateInfo from "./dicts/splat3/data/parameter/latest/misc/spl__DamageRateInfoConfig.pp__CombinationDataTableData.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SPLAT3_DATA_PATH = path.join(__dirname, "dicts", "splat3", "data");

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
	const result: Array<[langCode: string, translations: typeof euEn]> = [];

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

export const loadWeaponInfoMain = () =>
	loadLatestMushJson<typeof weaponInfoMain>("WeaponInfoMain");
export const loadWeaponInfoSub = () =>
	loadLatestMushJson<typeof weaponInfoSub>("WeaponInfoSub");
export const loadWeaponInfoSpecial = () =>
	loadLatestMushJson<typeof weaponInfoSpecial>("WeaponInfoSpecial");
export const loadGearInfoClothes = () =>
	loadLatestMushJson<typeof gearInfoClothes>("GearInfoClothes");
export const loadGearInfoHead = () =>
	loadLatestMushJson<typeof gearInfoHead>("GearInfoHead");
export const loadGearInfoShoes = () =>
	loadLatestMushJson<typeof gearInfoShoes>("GearInfoShoes");
export const loadSplPlayerParams = () =>
	loadLatestParameterMiscJson<typeof splPlayer>(
		"SplPlayer.game__GameParameterTable",
	);
export const loadDamageRateInfo = () =>
	loadLatestParameterMiscJson<typeof damageRateInfo>(
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
