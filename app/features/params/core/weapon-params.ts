import { PATCHES } from "~/features/builds/builds-constants";
import { DAMAGE_RECEIVERS } from "~/features/object-damage-calculator/calculator-constants";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	mainWeaponIds,
	weaponCategories,
	weaponIdToBaseWeaponId,
	weaponIdToType,
} from "~/modules/in-game-lists/weapon-ids";
import type {
	DamageMultiplierWithHistory,
	KitPatchHistory,
	ParamDefinition,
	ParamValueWithHistory,
	ParsedWeaponParams,
	PatchChange,
	SpecialPointWithHistory,
	WeaponKitInfo,
	WeaponParamKind,
	WeaponPatch,
} from "../weapon-params-types";
import { classifyParamChange } from "./param-directions";

/**
 * Sentinel `category` used for the special points entry in patch change data, since special
 * points are not a regular weapon parameter. The matching `key` is also this value.
 */
export const SPECIAL_POINTS_PARAM_KEY = "__specialPoints__";

/**
 * Sentinel `category` used for damage multiplier (damage rate vs objects) entries in patch
 * change data. The `key` of such a change holds the damage receiver target instead.
 */
export const DAMAGE_MULTIPLIER_PARAM_KEY = "__damageMultiplier__";

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
	weaponId: number,
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

interface DamageRateHistoryRow {
	mainWeaponIds: number[];
	subWeaponIds: number[];
	specialWeaponIds: number[];
	targets: DamageMultiplierWithHistory[];
}

const DAMAGE_RECEIVER_ORDER = new Map(
	DAMAGE_RECEIVERS.map((receiver, i) => [receiver as string, i]),
);

/** Whether `candidate` is a better single representative of a target than the `current` pick. */
function isMoreInformativeMultiplier(
	candidate: DamageMultiplierWithHistory,
	current: DamageMultiplierWithHistory,
): boolean {
	if (candidate.history.length !== current.history.length) {
		return candidate.history.length > current.history.length;
	}
	return candidate.current > current.current;
}

/**
 * Collects the damage multiplier history of every damage rate row that applies to the given
 * weapon, reduced to a single entry per object target. A weapon can map to several rows (e.g.
 * different attacks) that share the same target; the most informative one (longest tracked
 * history, then highest current rate) is kept. Entries are ordered like {@link DAMAGE_RECEIVERS}.
 */
export function damageMultipliersForWeapon(
	rows: Record<string, DamageRateHistoryRow>,
	weaponId: number,
	kind: WeaponParamKind,
): DamageMultiplierWithHistory[] {
	const applies = (row: DamageRateHistoryRow) => {
		if (kind === "sub") return row.subWeaponIds.includes(weaponId);
		if (kind === "special") return row.specialWeaponIds.includes(weaponId);
		return (
			row.mainWeaponIds.includes(weaponId) ||
			row.mainWeaponIds.includes(
				weaponIdToBaseWeaponId(weaponId as MainWeaponId),
			)
		);
	};

	const byTarget = new Map<string, DamageMultiplierWithHistory>();

	for (const row of Object.values(rows)) {
		if (!applies(row)) continue;
		for (const target of row.targets) {
			const existing = byTarget.get(target.target);
			if (!existing || isMoreInformativeMultiplier(target, existing)) {
				byTarget.set(target.target, target);
			}
		}
	}

	return [...byTarget.values()].sort(
		(a, b) =>
			(DAMAGE_RECEIVER_ORDER.get(a.target) ?? Number.MAX_SAFE_INTEGER) -
			(DAMAGE_RECEIVER_ORDER.get(b.target) ?? Number.MAX_SAFE_INTEGER),
	);
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
function computeWeaponPatchChanges(
	parsed: ParsedWeaponParams,
	versions: string[],
	specialPoints?: SpecialPointWithHistory[],
	damageMultipliers?: DamageMultiplierWithHistory[],
	source?: WeaponParamKind,
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
					source,
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
				source,
			});
		}
	}

	for (const multiplier of damageMultipliers ?? []) {
		for (const { patchVersion, from, to } of changesFromHistory(
			multiplier.history,
			multiplier.current,
			versions,
			versionIndex,
		)) {
			// A higher damage rate means the weapon deals more damage to the object.
			const kind = from === to ? "neutral" : to > from ? "buff" : "nerf";
			push(patchVersion, {
				category: DAMAGE_MULTIPLIER_PARAM_KEY,
				key: multiplier.target,
				from,
				to,
				kind,
				source,
			});
		}
	}

	for (const changes of byVersion.values()) {
		changes.sort((a, b) => {
			// Special points first (ordered by kit), then damage multipliers, then regular
			// params by category and key.
			const rank = (change: PatchChange) =>
				change.category === SPECIAL_POINTS_PARAM_KEY
					? 0
					: change.category === DAMAGE_MULTIPLIER_PARAM_KEY
						? 1
						: 2;
			const aRank = rank(a);
			const bRank = rank(b);
			if (aRank !== bRank) return aRank - bRank;

			if (aRank === 0) return (a.weaponId ?? 0) - (b.weaponId ?? 0);
			if (a.category !== b.category) {
				return a.category.localeCompare(b.category);
			}
			return a.key.localeCompare(b.key);
		});
	}

	return byVersion;
}

/**
 * Assembles per-version change maps into the descending-by-version patch history, attaching each
 * tracked game version's release date and skipping versions with no changes. When several maps are
 * given (e.g. a kit's main, sub and special weapon changes) their changes are concatenated in the
 * order the maps are passed, keeping each map's own within-version ordering.
 */
function changeMapsToPatches(
	maps: Array<Map<string, PatchChange[]>>,
	versions: string[],
): WeaponPatch[] {
	const patchDateByVersion = new Map(PATCHES.map((p) => [p.patch, p.date]));

	return versions
		.map((version) => ({
			version,
			date: patchDateByVersion.get(version) ?? null,
			changes: maps.flatMap((map) => map.get(version) ?? []),
		}))
		.filter((patch) => patch.changes.length > 0)
		.reverse();
}

/**
 * Builds the descending-by-version patch history of a single weapon, attaching each tracked
 * game version's release date and skipping versions with no tracked balance changes. Special
 * points changes are only folded in for main weapons (pass their history as `specialPoints`).
 */
export function buildWeaponPatchHistory(
	parsed: ParsedWeaponParams | undefined,
	versions: string[],
	specialPoints: SpecialPointWithHistory[] = [],
	damageMultipliers: DamageMultiplierWithHistory[] = [],
): WeaponPatch[] {
	if (!parsed) return [];

	return changeMapsToPatches(
		[
			computeWeaponPatchChanges(
				parsed,
				versions,
				specialPoints,
				damageMultipliers,
			),
		],
		versions,
	);
}

/**
 * Builds a patch history per kit of a main weapon, folding the (shared) main weapon changes
 * together with the kit's own special points, sub weapon and special weapon changes. Every change
 * is tagged with its `source` so the patch history can group a column under a divider per weapon.
 */
export function buildKitPatchHistories({
	mainParsed,
	versions,
	kits,
	specialPointsByKit,
	mainDamageMultipliers,
	subParams,
	subDamageMultipliers,
	specialParams,
	specialDamageMultipliers,
}: {
	mainParsed: ParsedWeaponParams | undefined;
	versions: string[];
	kits: WeaponKitInfo[];
	specialPointsByKit: Record<string, SpecialPointWithHistory>;
	mainDamageMultipliers: DamageMultiplierWithHistory[];
	subParams: Record<string, ParsedWeaponParams | undefined>;
	subDamageMultipliers: Record<string, DamageMultiplierWithHistory[]>;
	specialParams: Record<string, ParsedWeaponParams | undefined>;
	specialDamageMultipliers: Record<string, DamageMultiplierWithHistory[]>;
}): KitPatchHistory[] {
	if (!mainParsed) return [];

	return kits.map((kit) => {
		const kitSpecialPoints = specialPointsByKit[String(kit.weaponId)];
		const maps = [
			computeWeaponPatchChanges(
				mainParsed,
				versions,
				kitSpecialPoints ? [kitSpecialPoints] : [],
				mainDamageMultipliers,
				"main",
			),
		];

		const subParsed = subParams[String(kit.subWeaponId)];
		if (subParsed) {
			maps.push(
				computeWeaponPatchChanges(
					subParsed,
					versions,
					[],
					subDamageMultipliers[String(kit.subWeaponId)] ?? [],
					"sub",
				),
			);
		}

		const specialParsed = specialParams[String(kit.specialWeaponId)];
		if (specialParsed) {
			maps.push(
				computeWeaponPatchChanges(
					specialParsed,
					versions,
					[],
					specialDamageMultipliers[String(kit.specialWeaponId)] ?? [],
					"special",
				),
			);
		}

		return {
			weaponId: kit.weaponId,
			subWeaponId: kit.subWeaponId,
			specialWeaponId: kit.specialWeaponId,
			patches: changeMapsToPatches(maps, versions),
		};
	});
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
