// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "~/utils/logger";
import weapons from "./dicts/WeaponInfoMain.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PARAMETER_DIR = path.join(__dirname, "dicts", "parameter");
const OUTPUT_DIR = path.join(
	__dirname,
	"..",
	"app",
	"features",
	"weapons",
	"data",
);
const OUTPUT_FILE = path.join(OUTPUT_DIR, "weapon-params.json");

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

async function main() {
	logger.info("Starting weapon params sync...");

	const versionDirs = fs
		.readdirSync(PARAMETER_DIR)
		.filter((dir) => /^\d+$/.test(dir));
	const sortedVersions = sortVersions(versionDirs);

	logger.info(
		`Found ${sortedVersions.length} versions: ${sortedVersions.map(parseVersionToDisplay).join(", ")}`,
	);

	const weaponFileNameToId = buildWeaponFileNameToIdMap();
	logger.info(`Processing ${weaponFileNameToId.size} unique weapons`);

	const weaponParamsAllVersions = new Map<
		number,
		Map<string, Record<string, unknown>>
	>();

	for (const version of sortedVersions) {
		const weaponDir = path.join(PARAMETER_DIR, version, "weapon");
		if (!fs.existsSync(weaponDir)) continue;

		const files = fs.readdirSync(weaponDir);

		for (const file of files) {
			if (!weaponFileNameToId.has(file)) continue;

			const weaponId = weaponFileNameToId.get(file)!;
			const filePath = path.join(weaponDir, file);

			try {
				const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
				const params = stripTypeFields(content.GameParameters) as Record<
					string,
					unknown
				>;

				if (!weaponParamsAllVersions.has(weaponId)) {
					weaponParamsAllVersions.set(weaponId, new Map());
				}
				weaponParamsAllVersions.get(weaponId)!.set(version, params);
			} catch {
				logger.warn(`Failed to parse ${filePath}`);
			}
		}
	}

	const outputWeapons: Record<string, Record<string, unknown>> = {};
	const latestVersion = sortedVersions[sortedVersions.length - 1];

	for (const [weaponId, versionParams] of weaponParamsAllVersions) {
		const latestParams = versionParams.get(latestVersion);
		if (!latestParams) continue;

		const versionsWithWeapon = sortedVersions.filter((v) =>
			versionParams.has(v),
		);
		const paramsWithHistory = mergeWithHistory(
			latestParams,
			versionParams,
			versionsWithWeapon,
		);

		outputWeapons[String(weaponId)] = paramsWithHistory;
	}

	const output = {
		metadata: {
			generatedAt: new Date().toISOString(),
			latestVersion: parseVersionToDisplay(latestVersion),
			versions: sortedVersions.map(parseVersionToDisplay),
		},
		weapons: outputWeapons,
	};

	if (!fs.existsSync(OUTPUT_DIR)) {
		fs.mkdirSync(OUTPUT_DIR, { recursive: true });
	}

	fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
	logger.info(`Written to ${OUTPUT_FILE}`);
	logger.info(`Total weapons: ${Object.keys(outputWeapons).length}`);
}

main().catch((err) => logger.error(err));
