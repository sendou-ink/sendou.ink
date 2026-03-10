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

export function extractDamageSources(
	weaponIds: MainWeaponId[],
	targetSubDefenseAp = 0,
): WeaponDamageSource[] {
	return weaponIds.map((weaponId, slot) => {
		const stats = buildStats({ weaponSplId: weaponId, hasTacticooler: false });
		const damages: WeaponDamageSource["damages"] = [];

		for (const damage of stats.stats.damages) {
			const weaponType = damageTypeToWeaponType[damage.type];
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

		return {
			weaponSlot: slot,
			weaponId,
			damages,
		};
	});
}

export interface ExcludedDamageKey {
	weaponId: MainWeaponId;
	weaponType: "main" | "sub" | "special";
	damageType: DamageType;
}

export function getAllDamageKeys(
	weaponIds: MainWeaponId[],
	targetSubDefenseAp = 0,
): ExcludedDamageKey[] {
	const sources = extractDamageSources(weaponIds, targetSubDefenseAp);
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

export function calculateDamageCombos(
	weaponIds: MainWeaponId[],
	excludedKeys: ExcludedDamageKey[] = [],
	targetSubDefenseAp = 0,
	maxCombosDisplayed = MAX_COMBOS_DISPLAYED,
): DamageCombo[] {
	if (weaponIds.length < 2) {
		return [];
	}

	const excludedSet = new Set(
		excludedKeys.map((k) => `${k.weaponId}-${k.weaponType}-${k.damageType}`),
	);

	const sources = extractDamageSources(weaponIds, targetSubDefenseAp);
	const damageOptions = flattenToOptions(sources, excludedSet);
	const combos = generateCombinations(damageOptions);
	const filtered = filterAndSortCombos(combos, maxCombosDisplayed);

	return filtered;
}

function flattenToOptions(
	sources: WeaponDamageSource[],
	excludedSet: Set<string>,
): DamageOption[] {
	const options: DamageOption[] = [];

	for (const source of sources) {
		for (const damage of source.damages) {
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

interface PartialCombo {
	segments: DamageSegment[];
	totalDamage: number;
	hitCount: number;
	usedSlots: Set<number>;
	typeCountMap: Map<DamageType, number>;
	slotDamageType: Map<number, DamageType>;
}

function generateCombinations(options: DamageOption[]): DamageCombo[] {
	const results: DamageCombo[] = [];

	const initialState: PartialCombo = {
		segments: [],
		totalDamage: 0,
		hitCount: 0,
		usedSlots: new Set(),
		typeCountMap: new Map(),
		slotDamageType: new Map(),
	};

	backtrack(options, 0, initialState, results);

	return results;
}

function backtrack(
	options: DamageOption[],
	startIndex: number,
	current: PartialCombo,
	results: DamageCombo[],
): void {
	if (
		current.usedSlots.size >= 2 &&
		current.totalDamage >= COMBO_DAMAGE_THRESHOLD
	) {
		results.push({
			segments: [...current.segments],
			totalDamage: current.totalDamage,
			hitCount: current.hitCount,
		});
	}

	if (
		current.typeCountMap.size >= MAX_DAMAGE_TYPES_PER_COMBO &&
		current.totalDamage >= COMBO_DAMAGE_THRESHOLD
	) {
		return;
	}

	for (let i = startIndex; i < options.length; i++) {
		const option = options[i];
		const currentTypeCount = current.typeCountMap.get(option.damageType) ?? 0;

		if (
			current.typeCountMap.size >= MAX_DAMAGE_TYPES_PER_COMBO &&
			!current.typeCountMap.has(option.damageType)
		) {
			continue;
		}

		if (currentTypeCount >= MAX_REPEATS_PER_DAMAGE_TYPE) {
			continue;
		}

		const existingTypeForSlot = current.slotDamageType.get(option.weaponSlot);
		if (existingTypeForSlot && existingTypeForSlot !== option.damageType) {
			continue;
		}

		for (
			let count = 1;
			count <= Math.min(2, MAX_REPEATS_PER_DAMAGE_TYPE - currentTypeCount);
			count++
		) {
			const segment: DamageSegment = {
				weaponSlot: option.weaponSlot,
				weaponId: option.weaponId,
				damageType: option.damageType,
				damageValue: option.damageValue,
				isSubWeapon: option.weaponType === "SUB",
				isSpecialWeapon: option.weaponType === "SPECIAL",
				count,
			};

			const newUsedSlots = new Set(current.usedSlots);
			newUsedSlots.add(option.weaponSlot);

			const newTypeCountMap = new Map(current.typeCountMap);
			newTypeCountMap.set(option.damageType, currentTypeCount + count);

			const newSlotDamageType = new Map(current.slotDamageType);
			newSlotDamageType.set(option.weaponSlot, option.damageType);

			const newState: PartialCombo = {
				segments: [...current.segments, segment],
				totalDamage: current.totalDamage + option.damageValue * count,
				hitCount: current.hitCount + count,
				usedSlots: newUsedSlots,
				typeCountMap: newTypeCountMap,
				slotDamageType: newSlotDamageType,
			};

			backtrack(options, i + 1, newState, results);
		}
	}
}

function normalizeCombo(combo: DamageCombo): DamageCombo {
	const grouped = new Map<
		string,
		{ segment: DamageSegment; totalCount: number }
	>();

	for (const segment of combo.segments) {
		const key = `${segment.damageType}:${segment.damageValue}`;
		const existing = grouped.get(key);
		if (existing) {
			existing.totalCount += segment.count;
		} else {
			grouped.set(key, { segment, totalCount: segment.count });
		}
	}

	const segments: DamageSegment[] = [];
	for (const { segment, totalCount } of grouped.values()) {
		segments.push({ ...segment, count: totalCount });
	}

	segments.sort((a, b) => {
		const typeCompare = a.damageType.localeCompare(b.damageType);
		if (typeCompare !== 0) return typeCompare;
		return a.damageValue - b.damageValue;
	});

	return {
		segments,
		totalDamage: combo.totalDamage,
		hitCount: combo.hitCount,
	};
}

function comboKey(normalized: DamageCombo): string {
	return normalized.segments
		.map((s) => `${s.damageType}:${s.damageValue}:${s.count}`)
		.join("|");
}

function deduplicateCombos(combos: DamageCombo[]): DamageCombo[] {
	const seen = new Map<string, DamageCombo>();

	for (const combo of combos) {
		const normalized = normalizeCombo(combo);
		const key = comboKey(normalized);
		const existing = seen.get(key);

		if (!existing || combo.segments.length < existing.segments.length) {
			seen.set(key, combo);
		}
	}

	return [...seen.values()];
}

function filterAndSortCombos(
	combos: DamageCombo[],
	maxCombosDisplayed: number,
): DamageCombo[] {
	const filtered = combos.filter((combo) => {
		if (combo.totalDamage < COMBO_DAMAGE_THRESHOLD) {
			return false;
		}

		if (hasOneShot(combo)) {
			return false;
		}

		if (isExcessiveCombo(combo)) {
			return false;
		}

		return true;
	});

	const deduplicated = deduplicateCombos(filtered);

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

function hasOneShot(combo: DamageCombo): boolean {
	return combo.segments.some((s) => s.damageValue >= LETHAL_DAMAGE);
}

function isExcessiveCombo(combo: DamageCombo): boolean {
	const flatDamages = combo.segments.flatMap((s) =>
		Array(s.count).fill(s.damageValue),
	);
	const totalDamage = combo.totalDamage;

	for (let i = 0; i < flatDamages.length; i++) {
		const damage = flatDamages[i];

		const reducedDamage = totalDamage - damage;
		if (reducedDamage >= LETHAL_DAMAGE) {
			return true;
		}
	}

	return false;
}

const SPLASH_O_MATIC_ID = 20;

/**
 * Calculates the number of frames needed for enemy ink damage to finish off
 * a target after dealing a certain amount of combo damage.
 *
 * @param comboDamage - The damage dealt by the combo
 * @param targetResAp - The target's Ink Resistance Up ability points (0-57)
 * @returns The number of frames needed, or null if the combo is already lethal
 *          or ink damage cannot finish the kill (remaining damage exceeds ink damage limit)
 */
export function calculateInkTimeToKill(
	comboDamage: number,
	targetResAp: number,
): number | null {
	if (comboDamage >= 100) {
		return null;
	}

	const remainingDamage = 100 - comboDamage;

	const abilityPoints: AbilityPoints = new Map([["RES", targetResAp]]);
	const stats = buildStats({
		weaponSplId: SPLASH_O_MATIC_ID,
		abilityPoints,
		hasTacticooler: false,
	});

	const damagePerSecond = stats.stats.damageTakenInEnemyInkPerSecond.value;
	const damageLimit = stats.stats.enemyInkDamageLimit.value;
	const gracePeriodFrames =
		stats.stats.framesBeforeTakingDamageInEnemyInk.value;

	if (remainingDamage > damageLimit) {
		return null;
	}

	const damageFrames = remainingDamage / (damagePerSecond / 60);
	const totalFrames = gracePeriodFrames + damageFrames;

	return Math.ceil(totalFrames);
}

// TBD: Advanced filtering options
// - Distance range filtering
// - Damage type include/exclude
// - Hit count constraints
