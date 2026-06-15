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
} from "../weapon-params-types";

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
		} else if (
			typeof value === "object" &&
			value !== null &&
			!Array.isArray(value)
		) {
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

export function formatParamValue(value: number | string): string {
	if (typeof value === "number") {
		if (Number.isInteger(value)) {
			return String(value);
		}
		return value.toFixed(4).replace(/\.?0+$/, "");
	}
	return String(value);
}
