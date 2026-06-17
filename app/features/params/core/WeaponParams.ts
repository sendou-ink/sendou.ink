import { PATCHES } from "~/features/builds/builds-constants";
import { DAMAGE_RECEIVERS } from "~/features/object-damage-calculator/calculator-constants";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	mainWeaponIds,
	weaponCategories,
	weaponIdToBaseWeaponId,
	weaponIdToType,
} from "~/modules/in-game-lists/weapon-ids";
import {
	DAMAGE_MULTIPLIER_PARAM_KEY,
	INCOMING_DAMAGE_MULTIPLIER_PARAM_KEY,
	INCOMING_DAMAGE_RECEIVERS,
	SPECIAL_POINTS_PARAM_KEY,
} from "../weapon-params-constants";
import type {
	DamageMultiplierWithHistory,
	IncomingDamageAttackers,
	IncomingDamageMultiplierWithHistory,
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
 * Shape of the committed `all-version-*-params.json` data files: a map of weapon id to its raw
 * per-version params, the ordered list of tracked game versions, and (weapons only) special
 * points history.
 */
export interface AllVersionParams {
	metadata: { versions: string[] };
	weapons: Record<string, Record<string, Record<string, unknown>>>;
	specialPoints?: Record<
		string,
		{ history: Array<{ version: string; value: number }> }
	>;
}

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

interface DistanceDamageBreakpoint {
	Damage: number;
	Distance: number;
}

function isDistanceDamageBreakpoint(
	value: unknown,
): value is DistanceDamageBreakpoint {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as DistanceDamageBreakpoint).Damage === "number" &&
		typeof (value as DistanceDamageBreakpoint).Distance === "number"
	);
}

/**
 * Whether `value` is a damage falloff curve: an array of {@link DistanceDamageBreakpoint}, with
 * each entry possibly being a nested array of breakpoints (e.g. fizzy bomb bounces).
 */
function isDistanceDamageArray(
	value: unknown[],
): value is Array<DistanceDamageBreakpoint | DistanceDamageBreakpoint[]> {
	return (
		value.length > 0 &&
		value.every(
			(el) =>
				isDistanceDamageBreakpoint(el) ||
				(Array.isArray(el) &&
					el.length > 0 &&
					el.every(isDistanceDamageBreakpoint)),
		)
	);
}

/**
 * Serializes a damage falloff curve into a compact `"<damage> @ <distance>"` string (damage
 * scaled to displayed HP, i.e. divided by 10) so its per-version changes flow through the same
 * scalar param pipeline as plain values. Nested breakpoint arrays are flattened.
 */
function formatDistanceDamageArray(
	value: Array<DistanceDamageBreakpoint | DistanceDamageBreakpoint[]>,
): string {
	return value
		.flat()
		.map(
			(breakpoint) =>
				`${formatValue(breakpoint.Damage / 10)} @ ${formatValue(breakpoint.Distance)}`,
		)
		.join(", ");
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
			// Damage falloff curves and arrays of plain numbers/strings (e.g.
			// SplashSpawnParam.ForceSpawnNearestAddNumArray) are kept as a single joined string so
			// their per-version changes still show up. Other arrays of objects are too structured
			// to represent this way and are skipped.
			if (isDistanceDamageArray(value)) {
				result.push([fullKey, formatDistanceDamageArray(value)]);
			} else if (
				value.length > 0 &&
				value.every((el) => typeof el === "number" || typeof el === "string")
			) {
				result.push([
					fullKey,
					`[${value.map((el) => formatValue(el)).join(", ")}]`,
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

/**
 * Parses a single weapon's raw per-version params into the {@link ParsedWeaponParams} shape: each
 * parameter's current value plus its tracked history, grouped by category.
 */
export function parse(
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

/**
 * Parses the params of every given weapon id from a static all-version params data file, keyed by
 * weapon id (as a string). Ids with no entry in the data are skipped. `toDataKey` maps a weapon id
 * to the id its params are stored under — main weapons share params with their base weapon, while
 * subs and specials use their own id (the default identity mapping).
 */
export function parseMany<Id extends number>(
	ids: readonly Id[],
	data: AllVersionParams,
	toDataKey: (id: Id) => number = (id) => id,
): Record<string, ParsedWeaponParams> {
	const result: Record<string, ParsedWeaponParams> = {};

	for (const id of ids) {
		const rawParams = data.weapons[String(toDataKey(id))];
		if (rawParams) {
			result[String(id)] = parse(id, rawParams, data.metadata.versions);
		}
	}

	return result;
}

/**
 * Collects every distinct `${category}.${key}` parameter present across the given weapons, sorted
 * by category then key, for use as the comparison table's row definitions.
 */
export function allParamKeys(
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

/**
 * Returns the base main weapon ids of the given weapon's category, used as the columns its params
 * are compared against. A non-base weapon is kept first, followed by the other base weapons.
 */
export function categoryWeaponIds(weaponId: MainWeaponId): MainWeaponId[] {
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
export function kitSiblingIds(weaponId: MainWeaponId): MainWeaponId[] {
	const baseId = weaponIdToBaseWeaponId(weaponId);
	return mainWeaponIds.filter(
		(id) =>
			weaponIdToBaseWeaponId(id) === baseId &&
			weaponIdToType(id) !== "ALT_SKIN",
	);
}

/** Whether the given parameter has any tracked per-version history. */
export function hasHistory(param: ParamValueWithHistory): boolean {
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

const EMPTY_ATTACKERS: IncomingDamageAttackers = {
	mainWeaponIds: [],
	subWeaponIds: [],
	specialWeaponIds: [],
};

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

/** A stable identifier for a group of attacking weapons, used to de-duplicate incoming entries. */
function attackerGroupKey(attackers: IncomingDamageAttackers): string {
	const part = (ids: number[]) => [...ids].sort((a, b) => a - b).join(",");
	return `m${part(attackers.mainWeaponIds)};s${part(attackers.subWeaponIds)};x${part(attackers.specialWeaponIds)}`;
}

/**
 * Collects, for the given sub or special weapon (which must itself be a damageable object), the
 * history of every *other* weapon's damage multiplier against it. Each entry is one group of
 * attacking weapons that shared a rate change against one of the weapon's receiver targets; per
 * (attacker group, target) the most informative entry (longest history, then highest rate) is
 * kept. Entries are ordered like {@link DAMAGE_RECEIVERS}, then by attacker group.
 */
export function incomingDamageMultipliersForWeapon(
	rows: Record<string, DamageRateHistoryRow>,
	weaponId: number,
	kind: "sub" | "special",
): IncomingDamageMultiplierWithHistory[] {
	const receiverTargets = INCOMING_DAMAGE_RECEIVERS[kind][weaponId];
	if (!receiverTargets) return [];
	const targetSet = new Set<string>(receiverTargets);

	const byKey = new Map<string, IncomingDamageMultiplierWithHistory>();

	for (const row of Object.values(rows)) {
		const attackers: IncomingDamageAttackers = {
			mainWeaponIds:
				row.mainWeaponIds as IncomingDamageAttackers["mainWeaponIds"],
			subWeaponIds: row.subWeaponIds as IncomingDamageAttackers["subWeaponIds"],
			specialWeaponIds:
				row.specialWeaponIds as IncomingDamageAttackers["specialWeaponIds"],
		};
		const attackerKey = attackerGroupKey(attackers);

		for (const target of row.targets) {
			if (!targetSet.has(target.target)) continue;

			const key = `${attackerKey}|${target.target}`;
			const existing = byKey.get(key);
			if (!existing || isMoreInformativeMultiplier(target, existing)) {
				byKey.set(key, {
					target: target.target,
					attackers,
					current: target.current,
					history: target.history,
				});
			}
		}
	}

	return [...byKey.values()].sort((a, b) => {
		const order =
			(DAMAGE_RECEIVER_ORDER.get(a.target) ?? Number.MAX_SAFE_INTEGER) -
			(DAMAGE_RECEIVER_ORDER.get(b.target) ?? Number.MAX_SAFE_INTEGER);
		if (order !== 0) return order;
		return attackerGroupKey(a.attackers).localeCompare(
			attackerGroupKey(b.attackers),
		);
	});
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
	incomingDamageMultipliers?: IncomingDamageMultiplierWithHistory[],
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

	for (const multiplier of incomingDamageMultipliers ?? []) {
		for (const { patchVersion, from, to } of changesFromHistory(
			multiplier.history,
			multiplier.current,
			versions,
			versionIndex,
		)) {
			// A higher incoming damage rate means the object takes more damage, i.e. a nerf to the
			// sub or special weapon being defended (the inverse of an outgoing damage multiplier).
			const kind = from === to ? "neutral" : to > from ? "nerf" : "buff";
			push(patchVersion, {
				category: INCOMING_DAMAGE_MULTIPLIER_PARAM_KEY,
				key: multiplier.target,
				from,
				to,
				kind,
				source,
				attackers: multiplier.attackers,
			});
		}
	}

	for (const changes of byVersion.values()) {
		changes.sort((a, b) => {
			// Special points first (ordered by kit), then outgoing damage multipliers, then
			// incoming damage multipliers, then regular params by category and key.
			const rank = (change: PatchChange) =>
				change.category === SPECIAL_POINTS_PARAM_KEY
					? 0
					: change.category === DAMAGE_MULTIPLIER_PARAM_KEY
						? 1
						: change.category === INCOMING_DAMAGE_MULTIPLIER_PARAM_KEY
							? 2
							: 3;
			const aRank = rank(a);
			const bRank = rank(b);
			if (aRank !== bRank) return aRank - bRank;

			if (aRank === 0) return (a.weaponId ?? 0) - (b.weaponId ?? 0);
			if (aRank === 2) {
				const order =
					(DAMAGE_RECEIVER_ORDER.get(a.key) ?? Number.MAX_SAFE_INTEGER) -
					(DAMAGE_RECEIVER_ORDER.get(b.key) ?? Number.MAX_SAFE_INTEGER);
				if (order !== 0) return order;
				return attackerGroupKey(a.attackers ?? EMPTY_ATTACKERS).localeCompare(
					attackerGroupKey(b.attackers ?? EMPTY_ATTACKERS),
				);
			}
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
export function patchHistory(
	parsed: ParsedWeaponParams | undefined,
	versions: string[],
	specialPoints: SpecialPointWithHistory[] = [],
	damageMultipliers: DamageMultiplierWithHistory[] = [],
	incomingDamageMultipliers: IncomingDamageMultiplierWithHistory[] = [],
): WeaponPatch[] {
	if (!parsed) return [];

	return changeMapsToPatches(
		[
			computeWeaponPatchChanges(
				parsed,
				versions,
				specialPoints,
				damageMultipliers,
				undefined,
				incomingDamageMultipliers,
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
export function kitPatchHistories({
	mainParsed,
	versions,
	kits,
	specialPointsByKit,
	mainDamageMultipliers,
	subParams,
	subDamageMultipliers,
	subIncomingDamageMultipliers,
	specialParams,
	specialDamageMultipliers,
	specialIncomingDamageMultipliers,
}: {
	mainParsed: ParsedWeaponParams | undefined;
	versions: string[];
	kits: WeaponKitInfo[];
	specialPointsByKit: Record<string, SpecialPointWithHistory>;
	mainDamageMultipliers: DamageMultiplierWithHistory[];
	subParams: Record<string, ParsedWeaponParams | undefined>;
	subDamageMultipliers: Record<string, DamageMultiplierWithHistory[]>;
	subIncomingDamageMultipliers: Record<
		string,
		IncomingDamageMultiplierWithHistory[]
	>;
	specialParams: Record<string, ParsedWeaponParams | undefined>;
	specialDamageMultipliers: Record<string, DamageMultiplierWithHistory[]>;
	specialIncomingDamageMultipliers: Record<
		string,
		IncomingDamageMultiplierWithHistory[]
	>;
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

		const subIncoming =
			subIncomingDamageMultipliers[String(kit.subWeaponId)] ?? [];
		const subParsed = subParams[String(kit.subWeaponId)];
		if (subParsed || subIncoming.length > 0) {
			maps.push(
				computeWeaponPatchChanges(
					subParsed ?? { weaponId: kit.subWeaponId, categories: {} },
					versions,
					[],
					subDamageMultipliers[String(kit.subWeaponId)] ?? [],
					"sub",
					subIncoming,
				),
			);
		}

		const specialIncoming =
			specialIncomingDamageMultipliers[String(kit.specialWeaponId)] ?? [];
		const specialParsed = specialParams[String(kit.specialWeaponId)];
		if (specialParsed || specialIncoming.length > 0) {
			maps.push(
				computeWeaponPatchChanges(
					specialParsed ?? { weaponId: kit.specialWeaponId, categories: {} },
					versions,
					[],
					specialDamageMultipliers[String(kit.specialWeaponId)] ?? [],
					"special",
					specialIncoming,
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

/** Formats a parameter value for display, trimming trailing zeroes from non-integer numbers. */
export function formatValue(value: number | string): string {
	if (typeof value === "number") {
		if (Number.isInteger(value)) {
			return String(value);
		}
		return value.toFixed(4).replace(/\.?0+$/, "");
	}
	return String(value);
}
