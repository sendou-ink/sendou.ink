/**
 * Damage combos of a comp: the ways hits from different weapons (main, sub and special damages
 * alike) add up to a splat when no single hit does. Combos are searched by backtracking over every
 * damage the comp deals, kept lethal but not excessive, deduplicated and ordered closest to 100
 * damage first. Damages come from the build analyzer's stats of each weapon.
 */

import { damageTypeToWeaponType } from "~/features/build-analyzer/analyzer-constants";
import type {
	AbilityPoints,
	DamageType,
} from "~/features/build-analyzer/analyzer-types";
import {
	buildStats,
	subWeaponDamageValue,
} from "~/features/build-analyzer/core/stats";
import { weaponParams } from "~/features/build-analyzer/core/utils";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	COMBO_DAMAGE_THRESHOLD,
	LETHAL_DAMAGE,
	MAX_COMBOS_DISPLAYED,
	MAX_DAMAGE_TYPES_PER_COMBO,
	MAX_REPEATS_PER_DAMAGE_TYPE,
	VIRTUAL_DAMAGE_COMBOS,
} from "../comp-analyzer-constants";
import type {
	DamageCombo,
	DamageSegment,
	WeaponDamageSource,
} from "../comp-analyzer-types";

interface DamageOption {
	weaponSlot: number;
	weaponId: MainWeaponId;
	damageType: DamageType;
	damageValue: number;
	weaponType: "MAIN" | "SUB" | "SPECIAL";
}

const weaponDamagesCache = new Map<string, WeaponDamageSource["damages"]>();

/** Every damage each weapon of the comp deals, against a target with `targetSubDefenseAp` of Sub Defense Up. */
export function damageSources(
	weaponIds: MainWeaponId[],
	targetSubDefenseAp = 0,
): WeaponDamageSource[] {
	return weaponIds.map((weaponId, slot) => ({
		weaponSlot: slot,
		weaponId,
		damages: weaponDamages(weaponId, targetSubDefenseAp),
	}));
}

function weaponDamages(
	weaponId: MainWeaponId,
	targetSubDefenseAp: number,
): WeaponDamageSource["damages"] {
	const cacheKey = `${weaponId}-${targetSubDefenseAp}`;
	const cached = weaponDamagesCache.get(cacheKey);
	if (cached) return cached;

	const stats = buildStats({ weaponSplId: weaponId, hasTacticooler: false });
	const damages: WeaponDamageSource["damages"] = [];

	for (const damage of stats.stats.damages) {
		const weaponType = damageTypeToWeaponType[damage.type];
		// same values as the grounded blast, only the radius differs
		if (damage.type === "DISTANCE_JUMP") continue;
		if (weaponType === "MAIN") {
			damages.push({
				type: damage.type,
				value: damage.value,
				weaponType: "MAIN",
			});
		}
	}

	for (const subDamage of stats.stats.subWeaponDefenseDamages) {
		if (subDamage.subWeaponId === stats.weapon.subWeaponSplId) {
			const params = weaponParams();
			const reducedValue =
				targetSubDefenseAp === 0
					? subDamage.baseValue
					: subWeaponDamageValue({
							baseValue: subDamage.baseValue,
							subWeaponId: subDamage.subWeaponId,
							abilityPoints: targetSubDefenseAp,
							params: params.subWeapons[subDamage.subWeaponId],
						});
			damages.push({
				type: subDamage.type,
				value: reducedValue,
				weaponType: "SUB",
			});
		}
	}

	for (const specialDamage of stats.stats.specialWeaponDamages) {
		damages.push({
			type: specialDamage.type,
			value: specialDamage.value,
			weaponType: "SPECIAL",
		});
	}

	const virtualCombos = VIRTUAL_DAMAGE_COMBOS[weaponId];
	if (virtualCombos) {
		for (const combo of virtualCombos) {
			const combinedValue = combo.damageTypes.reduce((sum, type) => {
				const damage = damages.find((d) => d.type === type);
				return sum + (damage?.value ?? 0);
			}, 0);

			if (combinedValue > 0) {
				damages.push({
					type: combo.virtualType,
					value: combinedValue,
					weaponType: "MAIN",
				});
			}
		}
	}

	weaponDamagesCache.set(cacheKey, damages);

	return damages;
}

/** A damage of one weapon, as the user excludes it from the combos. */
export interface ExcludedDamageKey {
	weaponId: MainWeaponId;
	weaponType: "main" | "sub" | "special";
	damageType: DamageType;
}

/** Every damage of the comp's weapons once, the ones the user can exclude from the combos. */
export function damageKeys(
	weaponIds: MainWeaponId[],
	targetSubDefenseAp = 0,
): ExcludedDamageKey[] {
	const sources = damageSources(weaponIds, targetSubDefenseAp);
	const seen = new Set<string>();
	const keys: ExcludedDamageKey[] = [];

	for (const source of sources) {
		for (const damage of source.damages) {
			const weaponType = damage.weaponType.toLowerCase() as
				| "main"
				| "sub"
				| "special";
			const keyString = `${source.weaponId}-${weaponType}-${damage.type}`;

			if (seen.has(keyString)) {
				continue;
			}
			seen.add(keyString);

			keys.push({
				weaponId: source.weaponId,
				weaponType,
				damageType: damage.type,
			});
		}
	}

	return keys;
}

/**
 * The comp's damage combos, best first: lethal ones closest to 100 damage with the fewest hits.
 * Combos span at least two weapons unless `includeSingleWeaponCombos`, where a weapon's main, sub
 * and special count as separate sources.
 */
export function calculate(
	weaponIds: MainWeaponId[],
	excludedKeys: ExcludedDamageKey[] = [],
	targetSubDefenseAp = 0,
	maxCombosDisplayed = MAX_COMBOS_DISPLAYED,
	includeSingleWeaponCombos = false,
): DamageCombo[] {
	const minWeaponSlots = includeSingleWeaponCombos ? 1 : 2;
	if (weaponIds.length < minWeaponSlots) {
		return [];
	}

	const excludedSet = new Set(
		excludedKeys.map((k) => `${k.weaponId}-${k.weaponType}-${k.damageType}`),
	);

	const sources = damageSources(weaponIds, targetSubDefenseAp);
	const damageOptions = flattenToOptions(sources, excludedSet);
	const combos = generateCombinations(
		damageOptions,
		weaponIds.length,
		minWeaponSlots,
		includeSingleWeaponCombos,
	);

	return dedupeAndSortCombos(combos, maxCombosDisplayed);
}

function flattenToOptions(
	sources: WeaponDamageSource[],
	excludedSet: Set<string>,
): DamageOption[] {
	const options: DamageOption[] = [];

	for (const source of sources) {
		for (const damage of source.damages) {
			// one-shots are not combos
			if (damage.value >= LETHAL_DAMAGE) continue;

			const weaponType = damage.weaponType.toLowerCase() as
				| "main"
				| "sub"
				| "special";
			const key = `${source.weaponId}-${weaponType}-${damage.type}`;

			if (excludedSet.has(key)) {
				continue;
			}

			options.push({
				weaponSlot: source.weaponSlot,
				weaponId: source.weaponId,
				damageType: damage.type,
				damageValue: damage.value,
				weaponType: damage.weaponType,
			});
		}
	}

	return options;
}

/**
 * A "channel" contributes at most one damage type per combo: in single-weapon mode each of
 * main/sub/special is its own channel, otherwise a whole slot is one.
 */
function slotDamageChannel(
	option: DamageOption,
	includeSingleWeaponCombos: boolean,
): string {
	return includeSingleWeaponCombos
		? `${option.weaponSlot}-${option.weaponType}`
		: String(option.weaponSlot);
}

/**
 * Backtracks over the options with mutable state. A combo that stays lethal with any single hit
 * removed is excessive, and so is every combo extending it, so such branches are pruned.
 */
function generateCombinations(
	options: DamageOption[],
	slotCount: number,
	minWeaponSlots: number,
	includeSingleWeaponCombos: boolean,
): DamageCombo[] {
	const results: DamageCombo[] = [];

	const channels = options.map((option) =>
		slotDamageChannel(option, includeSingleWeaponCombos),
	);
	const segments: DamageSegment[] = [];
	const slotHitCounts: number[] = new Array(slotCount).fill(0);
	const typeCounts = new Map<DamageType, number>();
	const channelTypes = new Map<string, DamageType>();
	let usedSlotCount = 0;

	const backtrack = (
		startIndex: number,
		totalDamage: number,
		hitCount: number,
		smallestHit: number,
	) => {
		if (
			usedSlotCount >= minWeaponSlots &&
			totalDamage >= COMBO_DAMAGE_THRESHOLD
		) {
			results.push({ segments: [...segments], totalDamage, hitCount });
		}

		if (
			typeCounts.size >= MAX_DAMAGE_TYPES_PER_COMBO &&
			totalDamage >= COMBO_DAMAGE_THRESHOLD
		) {
			return;
		}

		for (let i = startIndex; i < options.length; i++) {
			const option = options[i];
			const currentTypeCount = typeCounts.get(option.damageType) ?? 0;

			if (
				typeCounts.size >= MAX_DAMAGE_TYPES_PER_COMBO &&
				currentTypeCount === 0
			) {
				continue;
			}

			if (currentTypeCount >= MAX_REPEATS_PER_DAMAGE_TYPE) {
				continue;
			}

			const channel = channels[i];
			const existingTypeForChannel = channelTypes.get(channel);
			if (
				existingTypeForChannel &&
				existingTypeForChannel !== option.damageType
			) {
				continue;
			}

			const newSmallestHit = Math.min(smallestHit, option.damageValue);

			for (
				let count = 1;
				count <= Math.min(2, MAX_REPEATS_PER_DAMAGE_TYPE - currentTypeCount);
				count++
			) {
				const newTotalDamage = totalDamage + option.damageValue * count;
				if (newTotalDamage - newSmallestHit >= LETHAL_DAMAGE) break;

				segments.push({
					weaponSlot: option.weaponSlot,
					weaponId: option.weaponId,
					damageType: option.damageType,
					damageValue: option.damageValue,
					isSubWeapon: option.weaponType === "SUB",
					isSpecialWeapon: option.weaponType === "SPECIAL",
					count,
				});
				if (slotHitCounts[option.weaponSlot] === 0) usedSlotCount++;
				slotHitCounts[option.weaponSlot] += count;
				typeCounts.set(option.damageType, currentTypeCount + count);
				channelTypes.set(channel, option.damageType);

				backtrack(i + 1, newTotalDamage, hitCount + count, newSmallestHit);

				segments.pop();
				slotHitCounts[option.weaponSlot] -= count;
				if (slotHitCounts[option.weaponSlot] === 0) usedSlotCount--;
				if (currentTypeCount === 0) {
					typeCounts.delete(option.damageType);
				} else {
					typeCounts.set(option.damageType, currentTypeCount);
				}
				if (existingTypeForChannel) {
					channelTypes.set(channel, existingTypeForChannel);
				} else {
					channelTypes.delete(channel);
				}
			}
		}
	};

	backtrack(0, 0, 0, Number.POSITIVE_INFINITY);

	return results;
}

function comboKey(combo: DamageCombo): string {
	const grouped = new Map<string, number>();

	for (const segment of combo.segments) {
		const key = `${segment.damageType}:${segment.damageValue}`;
		grouped.set(key, (grouped.get(key) ?? 0) + segment.count);
	}

	return [...grouped]
		.map(([key, count]) => `${key}:${count}`)
		.sort((a, b) => (a < b ? -1 : 1))
		.join("|");
}

function dedupeAndSortCombos(
	combos: DamageCombo[],
	maxCombosDisplayed: number,
): DamageCombo[] {
	const seen = new Map<string, DamageCombo>();

	for (const combo of combos) {
		const key = comboKey(combo);
		const existing = seen.get(key);

		if (!existing || combo.segments.length < existing.segments.length) {
			seen.set(key, combo);
		}
	}

	const deduplicated = [...seen.values()];

	deduplicated.sort((a, b) => {
		const aDistTo100 = Math.abs(a.totalDamage - 100);
		const bDistTo100 = Math.abs(b.totalDamage - 100);
		if (aDistTo100 !== bDistTo100) {
			return aDistTo100 - bDistTo100;
		}
		return a.hitCount - b.hitCount;
	});

	return deduplicated.slice(0, maxCombosDisplayed);
}

const SPLASH_O_MATIC_ID = 20;

/**
 * Frames of enemy ink damage needed to finish a target after `comboDamage`. `targetResAp` is Ink
 * Resistance Up AP (0-57). Null when the combo is already lethal or ink damage can't finish it.
 */
export function inkTimeToKill(
	comboDamage: number,
	targetResAp: number,
): number | null {
	if (comboDamage >= 100) {
		return null;
	}

	const remainingDamage = 100 - comboDamage;
	const { damagePerSecond, damageLimit, gracePeriodFrames } =
		enemyInkDamageStats(targetResAp);

	if (remainingDamage > damageLimit) {
		return null;
	}

	const damageFrames = remainingDamage / (damagePerSecond / 60);
	const totalFrames = gracePeriodFrames + damageFrames;

	return Math.ceil(totalFrames);
}

const enemyInkDamageStatsCache = new Map<
	number,
	{ damagePerSecond: number; damageLimit: number; gracePeriodFrames: number }
>();

function enemyInkDamageStats(targetResAp: number) {
	const cached = enemyInkDamageStatsCache.get(targetResAp);
	if (cached) return cached;

	const abilityPoints: AbilityPoints = new Map([["RES", targetResAp]]);
	const { stats } = buildStats({
		weaponSplId: SPLASH_O_MATIC_ID,
		abilityPoints,
		hasTacticooler: false,
	});

	const result = {
		damagePerSecond: stats.damageTakenInEnemyInkPerSecond.value,
		damageLimit: stats.enemyInkDamageLimit.value,
		gracePeriodFrames: stats.framesBeforeTakingDamageInEnemyInk.value,
	};
	enemyInkDamageStatsCache.set(targetResAp, result);

	return result;
}

// TBD: Advanced filtering options
// - Distance range filtering
// - Damage type include/exclude
// - Hit count constraints
