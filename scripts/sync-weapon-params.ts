import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	mainWeaponIds,
	specialWeaponIds,
	subWeaponIds,
} from "~/modules/in-game-lists/weapon-ids";
import { logger } from "~/utils/logger";
import weapons from "./dicts/WeaponInfoMain.json";
import specialWeapons from "./dicts/WeaponInfoSpecial.json";
import subWeapons from "./dicts/WeaponInfoSub.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PARAMETER_DIR = path.join(__dirname, "dicts", "parameter");
const MUSH_DIR = path.join(__dirname, "dicts", "mush");
const OUTPUT_DIR = path.join(
	__dirname,
	"..",
	"app",
	"features",
	"params",
	"data",
);
const OUTPUT_FILE = path.join(OUTPUT_DIR, "all-version-weapon-params.json");
const SUB_OUTPUT_FILE = path.join(OUTPUT_DIR, "all-version-sub-params.json");
const SPECIAL_OUTPUT_FILE = path.join(
	OUTPUT_DIR,
	"all-version-special-params.json",
);

const WEAPON_TYPES_TO_IGNORE = [
	"Mission",
	"Coop",
	"Hero",
	"Rival",
	"SalmonBuddy",
	"Sdodr",
];

type MainWeapon = (typeof weapons)[number];

function parseVersionToDisplay(version: string): string {
	const num = Number.parseInt(version, 10);
	const major = Math.floor(num / 100);
	const minor = Math.floor((num % 100) / 10);
	const patch = num % 10;
	return `${major}.${minor}.${patch}`;
}

function sortVersions(versions: string[]): string[] {
	return versions.sort(
		(a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10),
	);
}

function mainWeaponShouldBeSkipped(mainWeapon: MainWeapon): boolean {
	return WEAPON_TYPES_TO_IGNORE.includes(mainWeapon.Type);
}

function weaponRowIdToFileName(rowId: string): string {
	const parts = rowId.split("_");
	const category = parts[0];
	const codeName = parts[1];
	return `Weapon${category}${codeName ?? ""}.game__GameParameterTable.json`;
}

function buildWeaponFileNameToIdMap(): Map<string, number> {
	const map = new Map<string, number>();
	const seenFileNames = new Set<string>();

	for (const weapon of weapons) {
		if (mainWeaponShouldBeSkipped(weapon)) continue;

		const fileName = weaponRowIdToFileName(weapon.__RowId);

		if (!seenFileNames.has(fileName)) {
			seenFileNames.add(fileName);
			map.set(fileName, weapon.Id);
		}
	}

	return map;
}

// Sub and special weapons share the per-version `weapon` GameParameterTable dump with main
// weapons, so only the canonical "Versus" entry of each id is kept (Hero/Mission/etc. variants
// of the same weapon are ignored).
function buildSubOrSpecialFileNameToIdMap(
	entries: Array<{ Id: number; __RowId: string; Type: string }>,
	allowedIds: ReadonlySet<number>,
): Map<string, number> {
	const map = new Map<string, number>();
	const seenFileNames = new Set<string>();

	for (const entry of entries) {
		if (entry.Type !== "Versus") continue;
		if (!allowedIds.has(entry.Id)) continue;

		const fileName = weaponRowIdToFileName(entry.__RowId);

		if (!seenFileNames.has(fileName)) {
			seenFileNames.add(fileName);
			map.set(fileName, entry.Id);
		}
	}

	return map;
}

function stripTypeFields(obj: unknown): unknown {
	if (obj === null || typeof obj !== "object") {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map(stripTypeFields);
	}

	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		if (key === "$type") continue;
		result[key] = stripTypeFields(value);
	}
	return result;
}

function deepEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function getLeafPaths(
	obj: unknown,
	prefix = "",
): Array<{ path: string; value: unknown }> {
	const results: Array<{ path: string; value: unknown }> = [];

	if (obj === null || typeof obj !== "object") {
		return [{ path: prefix, value: obj }];
	}

	if (Array.isArray(obj)) {
		return [{ path: prefix, value: obj }];
	}

	for (const [key, value] of Object.entries(obj)) {
		const newPath = prefix ? `${prefix}.${key}` : key;

		if (value === null || typeof value !== "object" || Array.isArray(value)) {
			results.push({ path: newPath, value });
		} else {
			results.push(...getLeafPaths(value, newPath));
		}
	}

	return results;
}

function setNestedValueWithVersionedKey(
	obj: Record<string, unknown>,
	pathStr: string,
	version: string,
	value: unknown,
): void {
	const parts = pathStr.split(".");
	let current = obj;

	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		if (!(part in current) || typeof current[part] !== "object") {
			current[part] = {};
		}
		current = current[part] as Record<string, unknown>;
	}

	const lastPart = parts[parts.length - 1];
	const versionedKey = `${lastPart}@${version}`;
	current[versionedKey] = value;
}

function getNestedValue(obj: unknown, pathStr: string): unknown {
	const parts = pathStr.split(".");
	let current = obj;

	for (const part of parts) {
		if (current === null || typeof current !== "object") {
			return undefined;
		}
		current = (current as Record<string, unknown>)[part];
	}

	return current;
}

function mergeWithHistory(
	latestParams: Record<string, unknown>,
	allVersionParams: Map<string, Record<string, unknown>>,
	sortedVersions: string[],
): Record<string, unknown> {
	const result: Record<string, unknown> = JSON.parse(
		JSON.stringify(latestParams),
	);

	const latestPaths = getLeafPaths(latestParams);

	for (const { path: paramPath, value: latestValue } of latestPaths) {
		for (let i = sortedVersions.length - 2; i >= 0; i--) {
			const version = sortedVersions[i];
			const versionParams = allVersionParams.get(version);
			if (!versionParams) continue;

			const versionValue = getNestedValue(versionParams, paramPath);
			if (versionValue === undefined) continue;

			const nextVersion = sortedVersions[i + 1];
			const nextParams = allVersionParams.get(nextVersion);
			const nextValue = nextParams
				? getNestedValue(nextParams, paramPath)
				: latestValue;

			if (!deepEqual(versionValue, nextValue)) {
				setNestedValueWithVersionedKey(
					result,
					paramPath,
					parseVersionToDisplay(version),
					versionValue,
				);
			}
		}
	}

	return result;
}

// SpecialPoint lives in WeaponInfoMain (kit data), which is not part of the per-version weapon
// GameParameterTable dump, so it is read per version from the local mush dir.
function collectSpecialPointsByVersion(
	sortedVersions: string[],
): Map<number, Map<string, number>> {
	const result = new Map<number, Map<string, number>>();
	const mainWeaponIdSet = new Set<number>(mainWeaponIds);

	for (const version of sortedVersions) {
		const filePath = path.join(MUSH_DIR, version, "WeaponInfoMain.json");
		if (!fs.existsSync(filePath)) continue;

		let entries: MainWeapon[];
		try {
			entries = JSON.parse(fs.readFileSync(filePath, "utf8"));
		} catch {
			logger.warn(`Failed to parse ${filePath}`);
			continue;
		}

		for (const weapon of entries) {
			if (mainWeaponShouldBeSkipped(weapon)) continue;
			if (!mainWeaponIdSet.has(weapon.Id)) continue;
			if (typeof weapon.SpecialPoint !== "number") continue;

			if (!result.has(weapon.Id)) {
				result.set(weapon.Id, new Map());
			}
			result.get(weapon.Id)!.set(version, weapon.SpecialPoint);
		}
	}

	return result;
}

function buildSpecialPointsHistory(
	specialPointsByVersion: Map<number, Map<string, number>>,
	sortedVersions: string[],
): Record<
	string,
	{ current: number; history: Array<{ version: string; value: number }> }
> {
	const result: Record<
		string,
		{ current: number; history: Array<{ version: string; value: number }> }
	> = {};

	for (const [weaponId, byVersion] of specialPointsByVersion) {
		const presentVersions = sortedVersions.filter((v) => byVersion.has(v));
		if (presentVersions.length === 0) continue;

		const current = byVersion.get(presentVersions[presentVersions.length - 1])!;
		const history: Array<{ version: string; value: number }> = [];

		for (let i = 0; i < presentVersions.length - 1; i++) {
			const value = byVersion.get(presentVersions[i])!;
			const nextValue = byVersion.get(presentVersions[i + 1])!;
			if (value !== nextValue) {
				history.push({
					version: parseVersionToDisplay(presentVersions[i]),
					value,
				});
			}
		}

		result[String(weaponId)] = { current, history };
	}

	return result;
}

// Reads every per-version `weapon` GameParameterTable dump for the given files and folds the
// historical values of each weapon into its latest params using versioned (`Key@version`) keys.
function buildParamsWithHistory(
	fileNameToId: Map<string, number>,
	sortedVersions: string[],
): Record<string, Record<string, unknown>> {
	const allVersions = new Map<number, Map<string, Record<string, unknown>>>();

	for (const version of sortedVersions) {
		const weaponDir = path.join(PARAMETER_DIR, version, "weapon");
		if (!fs.existsSync(weaponDir)) continue;

		for (const file of fs.readdirSync(weaponDir)) {
			if (!fileNameToId.has(file)) continue;

			const weaponId = fileNameToId.get(file)!;
			const filePath = path.join(weaponDir, file);

			try {
				const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
				const params = stripTypeFields(content.GameParameters) as Record<
					string,
					unknown
				>;

				if (!allVersions.has(weaponId)) {
					allVersions.set(weaponId, new Map());
				}
				allVersions.get(weaponId)!.set(version, params);
			} catch {
				logger.warn(`Failed to parse ${filePath}`);
			}
		}
	}

	const output: Record<string, Record<string, unknown>> = {};
	const latestVersion = sortedVersions[sortedVersions.length - 1];

	for (const [weaponId, versionParams] of allVersions) {
		const latestParams = versionParams.get(latestVersion);
		if (!latestParams) continue;

		const versionsWithWeapon = sortedVersions.filter((v) =>
			versionParams.has(v),
		);

		output[String(weaponId)] = mergeWithHistory(
			latestParams,
			versionParams,
			versionsWithWeapon,
		);
	}

	return output;
}

async function main() {
	logger.info("Starting weapon params sync...");

	const versionDirs = fs
		.readdirSync(PARAMETER_DIR)
		.filter((dir) => /^\d+$/.test(dir));
	const sortedVersions = sortVersions(versionDirs);

	logger.info(
		`Found ${sortedVersions.length} versions: ${sortedVersions.map(parseVersionToDisplay).join(", ")}`,
	);

	const latestVersion = sortedVersions[sortedVersions.length - 1];
	const metadata = {
		generatedAt: new Date().toISOString(),
		latestVersion: parseVersionToDisplay(latestVersion),
		versions: sortedVersions.map(parseVersionToDisplay),
	};

	const weaponFileNameToId = buildWeaponFileNameToIdMap();
	logger.info(`Processing ${weaponFileNameToId.size} unique weapons`);
	const outputWeapons = buildParamsWithHistory(
		weaponFileNameToId,
		sortedVersions,
	);

	const specialPoints = buildSpecialPointsHistory(
		collectSpecialPointsByVersion(sortedVersions),
		sortedVersions,
	);

	const outputSubWeapons = buildParamsWithHistory(
		buildSubOrSpecialFileNameToIdMap(subWeapons, new Set(subWeaponIds)),
		sortedVersions,
	);

	const outputSpecialWeapons = buildParamsWithHistory(
		buildSubOrSpecialFileNameToIdMap(specialWeapons, new Set(specialWeaponIds)),
		sortedVersions,
	);

	if (!fs.existsSync(OUTPUT_DIR)) {
		fs.mkdirSync(OUTPUT_DIR, { recursive: true });
	}

	fs.writeFileSync(
		OUTPUT_FILE,
		JSON.stringify(
			{ metadata, weapons: outputWeapons, specialPoints },
			null,
			2,
		),
	);
	fs.writeFileSync(
		SUB_OUTPUT_FILE,
		JSON.stringify({ metadata, weapons: outputSubWeapons }, null, 2),
	);
	fs.writeFileSync(
		SPECIAL_OUTPUT_FILE,
		JSON.stringify({ metadata, weapons: outputSpecialWeapons }, null, 2),
	);

	logger.info(`Written to ${OUTPUT_FILE}`);
	logger.info(`Total main weapons: ${Object.keys(outputWeapons).length}`);
	logger.info(`Total sub weapons: ${Object.keys(outputSubWeapons).length}`);
	logger.info(
		`Total special weapons: ${Object.keys(outputSpecialWeapons).length}`,
	);
}

main().catch((err) => logger.error(err));
