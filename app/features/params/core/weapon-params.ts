import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	mainWeaponIds,
	weaponCategories,
	weaponIdToBaseWeaponId,
	weaponIdToType,
} from "~/modules/in-game-lists/weapon-ids";
import type {
	ParamDefinition,
	ParamValueWithHistory,
	ParsedWeaponParams,
	PatchChange,
	SpecialPointWithHistory,
} from "../weapon-params-types";
import { classifyParamChange } from "./param-directions";

/**
 * Sentinel `category` used for the special points entry in patch change data, since special
 * points are not a regular weapon parameter. The matching `key` is also this value.
 */
export const SPECIAL_POINTS_PARAM_KEY = "__specialPoints__";

// xxx: check if similar exist elsewhere, convert to utils to * as Module

function parseParamKey(key: string): {
	baseKey: string;
	version: string | null;
} {
	const atIndex = key.indexOf("@");
	if (atIndex === -1) {
		return { baseKey: key, version: null };
	}
	return {
		baseKey: key.slice(0, atIndex),
		version: key.slice(atIndex + 1),
	};
}

function flattenScalarParams(
	params: Record<string, unknown>,
	prefix = "",
): Array<[string, number | string]> {
	const result: Array<[string, number | string]> = [];

	for (const [key, value] of Object.entries(params)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;

		if (typeof value === "number" || typeof value === "string") {
			result.push([fullKey, value]);
		} else if (Array.isArray(value)) {
			// Arrays of plain numbers/strings (e.g. SplashSpawnParam.ForceSpawnNearestAddNumArray)
			// are kept as a joined string so their changes still show up. Arrays of objects are
			// too structured to represent this way and are skipped.
			if (
				value.length > 0 &&
				value.every((el) => typeof el === "number" || typeof el === "string")
			) {
				result.push([
					fullKey,
					`[${value.map((el) => formatParamValue(el)).join(", ")}]`,
				]);
			}
		} else if (typeof value === "object" && value !== null) {
			result.push(
				...flattenScalarParams(value as Record<string, unknown>, fullKey),
			);
		}
	}

	return result;
}

export function parseWeaponParams(
	weaponId: MainWeaponId,
	rawParams: Record<string, Record<string, unknown>>,
	versions: string[],
): ParsedWeaponParams {
	const categories: Record<string, Record<string, ParamValueWithHistory>> = {};

	for (const [categoryName, categoryParams] of Object.entries(rawParams)) {
		if (
			typeof categoryParams !== "object" ||
			categoryParams === null ||
			Object.keys(categoryParams).length === 0
		) {
			continue;
		}

		const parsedParams: Record<string, ParamValueWithHistory> = {};
		const paramHistory: Record<
			string,
			{ current: number | string; versions: Map<string, number | string> }
		> = {};

		for (const [key, value] of flattenScalarParams(categoryParams)) {
			const { baseKey, version } = parseParamKey(key);

			if (!paramHistory[baseKey]) {
				paramHistory[baseKey] = {
					current: value,
					versions: new Map(),
				};
			}

			if (version === null) {
				paramHistory[baseKey].current = value;
			} else {
				paramHistory[baseKey].versions.set(version, value);
			}
		}

		for (const [baseKey, data] of Object.entries(paramHistory)) {
			const history: Array<{ version: string; value: number | string }> = [];

			for (const version of versions) {
				const historicalValue = data.versions.get(version);
				if (historicalValue !== undefined) {
					history.push({ version, value: historicalValue });
				}
			}

			parsedParams[baseKey] = {
				current: data.current,
				history,
			};
		}

		if (Object.keys(parsedParams).length > 0) {
			categories[categoryName] = parsedParams;
		}
	}

	return { weaponId, categories };
}

export function collectAllParamKeys(
	weaponParams: Record<string, ParsedWeaponParams>,
): ParamDefinition[] {
	const seenKeys = new Set<string>();
	const definitions: ParamDefinition[] = [];

	for (const parsed of Object.values(weaponParams)) {
		for (const [category, params] of Object.entries(parsed.categories)) {
			for (const key of Object.keys(params)) {
				const fullKey = `${category}.${key}`;
				if (!seenKeys.has(fullKey)) {
					seenKeys.add(fullKey);
					definitions.push({ category, key, fullKey });
				}
			}
		}
	}

	definitions.sort((a, b) => {
		if (a.category !== b.category) {
			return a.category.localeCompare(b.category);
		}
		return a.key.localeCompare(b.key);
	});

	return definitions;
}

function getWeaponCategory(weaponId: MainWeaponId) {
	return weaponCategories.find((cat) =>
		(cat.weaponIds as readonly number[]).includes(weaponId),
	);
}

export function getCategoryWeaponIds(weaponId: MainWeaponId): MainWeaponId[] {
	const category = getWeaponCategory(weaponId);
	if (!category) {
		return [weaponId];
	}

	const baseWeapons = (category.weaponIds as readonly MainWeaponId[]).filter(
		(id) => weaponIdToType(id) === "BASE",
	);

	if (baseWeapons.includes(weaponId)) {
		return baseWeapons;
	}

	const currentWeaponBaseId = weaponIdToBaseWeaponId(weaponId);
	return [weaponId, ...baseWeapons.filter((id) => id !== currentWeaponBaseId)];
}

/**
 * Returns the main weapon ids that are kit siblings of the given weapon, i.e. they share
 * the same base weapon (e.g. a weapon and its alternate kit) but excluding cosmetic alt
 * skins. The returned list includes the given weapon itself.
 */
export function getWeaponKitSiblingIds(weaponId: MainWeaponId): MainWeaponId[] {
	const baseId = weaponIdToBaseWeaponId(weaponId);
	return mainWeaponIds.filter(
		(id) =>
			weaponIdToBaseWeaponId(id) === baseId &&
			weaponIdToType(id) !== "ALT_SKIN",
	);
}

export function hasParamHistory(param: ParamValueWithHistory): boolean {
	return param.history.length > 0;
}

function changesFromHistory(
	history: Array<{ version: string; value: number | string }>,
	current: number | string,
	versions: string[],
	versionIndex: Map<string, number>,
): Array<{ patchVersion: string; from: number | string; to: number | string }> {
	const result: Array<{
		patchVersion: string;
		from: number | string;
		to: number | string;
	}> = [];

	for (let i = 0; i < history.length; i++) {
		const { version, value: from } = history[i];
		const to = i < history.length - 1 ? history[i + 1].value : current;

		// A recorded value is the value *before* a change, so the change took effect at the
		// next tracked game version.
		const recordedIndex = versionIndex.get(version);
		if (recordedIndex === undefined) continue;
		const patchVersion = versions[recordedIndex + 1];
		if (!patchVersion) continue;

		result.push({ patchVersion, from, to });
	}

	return result;
}

/**
 * Groups every tracked parameter change of a single weapon by the game version (patch) that
 * introduced it. Optionally folds the weapon's special points history into the same grouping.
 *
 * Within each patch the changes are sorted with special points first, then alphabetically by
 * category and key.
 */
export function computeWeaponPatchChanges(
	parsed: ParsedWeaponParams,
	versions: string[],
	specialPoints?: SpecialPointWithHistory[],
): Map<string, PatchChange[]> {
	const versionIndex = new Map(versions.map((version, i) => [version, i]));
	const byVersion = new Map<string, PatchChange[]>();

	const push = (patchVersion: string, change: PatchChange) => {
		const existing = byVersion.get(patchVersion);
		if (existing) {
			existing.push(change);
		} else {
			byVersion.set(patchVersion, [change]);
		}
	};

	for (const [category, params] of Object.entries(parsed.categories)) {
		for (const [key, param] of Object.entries(params)) {
			for (const { patchVersion, from, to } of changesFromHistory(
				param.history,
				param.current,
				versions,
				versionIndex,
			)) {
				push(patchVersion, {
					category,
					key,
					from,
					to,
					kind: classifyParamChange(category, key, from, to),
				});
			}
		}
	}

	for (const kit of specialPoints ?? []) {
		for (const { patchVersion, from, to } of changesFromHistory(
			kit.history,
			kit.current,
			versions,
			versionIndex,
		)) {
			// Fewer special points needed means the special charges faster.
			const kind = from === to ? "neutral" : to < from ? "buff" : "nerf";
			push(patchVersion, {
				category: SPECIAL_POINTS_PARAM_KEY,
				key: SPECIAL_POINTS_PARAM_KEY,
				from,
				to,
				kind,
				weaponId: kit.weaponId,
			});
		}
	}

	for (const changes of byVersion.values()) {
		changes.sort((a, b) => {
			const aIsSpecial = a.category === SPECIAL_POINTS_PARAM_KEY;
			const bIsSpecial = b.category === SPECIAL_POINTS_PARAM_KEY;
			// Special points first, ordered by kit, then regular params by category and key.
			if (aIsSpecial || bIsSpecial) {
				if (aIsSpecial && bIsSpecial) {
					return (a.weaponId ?? 0) - (b.weaponId ?? 0);
				}
				return aIsSpecial ? -1 : 1;
			}
			if (a.category !== b.category) {
				return a.category.localeCompare(b.category);
			}
			return a.key.localeCompare(b.key);
		});
	}

	return byVersion;
}

export function formatParamValue(value: number | string): string {
	if (typeof value === "number") {
		if (Number.isInteger(value)) {
			return String(value);
		}
		return value.toFixed(4).replace(/\.?0+$/, "");
	}
	return String(value);
}
