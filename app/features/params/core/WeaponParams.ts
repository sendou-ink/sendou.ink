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

/** Shape of the committed `all-version-*-params.json` files. */
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

/** Damage falloff curve: {@link DistanceDamageBreakpoint}s, possibly nested (e.g. fizzy bomb bounces). */
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

/** Falloff curve as `"<damage> @ <distance>"` (damage / 10 = displayed HP) so it flows through the scalar param pipeline. */
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
			// falloff curves and arrays of primitives become one joined string so their changes still
			// show up; other arrays of objects are skipped
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

/** Raw per-version params of one weapon → {@link ParsedWeaponParams} (current value + history, by category). */
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
 * Parses every given weapon id from an all-version data file, keyed by id string; ids with no data are
 * skipped. `toDataKey` maps an id to the id its params are stored under (main weapons → base weapon).
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

/** Every distinct `${category}.${key}` across the weapons, sorted, for the comparison table rows. */
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

/** Base main weapon ids of the weapon's category (comparison columns); a non-base weapon is kept first. */
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

/** Main weapon ids sharing the base weapon (alternate kits, not alt skins), including the weapon itself. */
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
 * Damage multiplier history per object target, keeping the most informative row (longest history,
 * then highest rate) when several attacks share a target. Ordered like {@link DAMAGE_RECEIVERS}.
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
 * For a damageable sub/special: every other weapon's damage multiplier history against it, one entry
 * per (attacker group, target) keeping the most informative. Ordered like {@link DAMAGE_RECEIVERS}.
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

		// a recorded value is the value *before* a change, so it took effect at the next version
		const recordedIndex = versionIndex.get(version);
		if (recordedIndex === undefined) continue;
		const patchVersion = versions[recordedIndex + 1];
		if (!patchVersion) continue;

		result.push({ patchVersion, from, to });
	}

	return result;
}

/** Every tracked change of one weapon grouped by the patch that introduced it, optionally with special points. */
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
			// fewer points = charges faster
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
			// higher incoming rate = the sub/special takes more damage = nerf
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
			// special points, outgoing multipliers, incoming multipliers, then params by category and key
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

/** Change maps → descending patch history with release dates, skipping empty versions; maps concatenate in order. */
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

/** Descending patch history of one weapon. Pass `specialPoints` for main weapons to fold those changes in. */
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

/** Patch history per kit: shared main weapon changes + the kit's special points, sub and special. Changes are tagged by `source`. */
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
