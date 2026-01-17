import { damageTypeToWeaponType } from "~/features/build-analyzer/analyzer-constants";
import type { DamageType } from "~/features/build-analyzer/analyzer-types";
import { buildStats } from "~/features/build-analyzer/core/stats";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	COMBO_DAMAGE_THRESHOLD,
	MAX_COMBOS_DISPLAYED,
	MAX_DAMAGE_TYPES_PER_COMBO,
	MAX_REPEATS_PER_DAMAGE_TYPE,
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
				damages.push({
					type: subDamage.type,
					value: subDamage.baseValue,
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

		return {
			weaponSlot: slot,
			weaponId,
			damages,
		};
	});
}

export function calculateDamageCombos(
	weaponIds: MainWeaponId[],
): DamageCombo[] {
	if (weaponIds.length < 2) {
		return [];
	}

	const sources = extractDamageSources(weaponIds);
	const damageOptions = flattenToOptions(sources);
	const combos = generateCombinations(damageOptions);
	const filtered = filterAndSortCombos(combos);

	return filtered;
}

function flattenToOptions(sources: WeaponDamageSource[]): DamageOption[] {
	const options: DamageOption[] = [];

	for (const source of sources) {
		for (const damage of source.damages) {
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

function filterAndSortCombos(combos: DamageCombo[]): DamageCombo[] {
	const filtered = combos.filter(
		(combo) => combo.totalDamage >= COMBO_DAMAGE_THRESHOLD,
	);

	filtered.sort((a, b) => {
		const aDistTo100 = Math.abs(a.totalDamage - 100);
		const bDistTo100 = Math.abs(b.totalDamage - 100);
		if (aDistTo100 !== bDistTo100) {
			return aDistTo100 - bDistTo100;
		}
		return a.hitCount - b.hitCount;
	});

	return filtered.slice(0, MAX_COMBOS_DISPLAYED);
}

// TBD: Advanced filtering options
// - Distance range filtering
// - Damage type include/exclude
// - Hit count constraints
