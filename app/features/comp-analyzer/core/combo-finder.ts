import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { DamageCombo, DamageSource } from "../comp-analyzer-types";
import { extractWeaponDamages } from "./damage-extractor";

const TARGET_DAMAGE = 100;
const MAX_HITS = 5;
const MAX_COMBOS = 30;

interface ComboCandidate {
	sources: DamageSource[];
	totalDamage: number;
}

function generateCombos(
	allDamages: DamageSource[],
	targetDamage: number,
	maxHits: number,
): ComboCandidate[] {
	const results: ComboCandidate[] = [];

	const sortedDamages = [...allDamages].sort((a, b) => b.damage - a.damage);

	for (let hitCount = 1; hitCount <= maxHits; hitCount++) {
		generateCombosOfSize(sortedDamages, targetDamage, hitCount, results);
		if (results.length >= MAX_COMBOS * 2) break;
	}

	return results;
}

function generateCombosOfSize(
	damages: DamageSource[],
	targetDamage: number,
	size: number,
	results: ComboCandidate[],
): void {
	function recurse(depth: number, startIdx: number, current: DamageSource[]) {
		if (depth === size) {
			const totalDamage = current.reduce((sum, d) => sum + d.damage, 0);
			if (totalDamage >= targetDamage) {
				results.push({
					sources: [...current],
					totalDamage,
				});
			}
			return;
		}

		for (let i = startIdx; i < damages.length; i++) {
			current.push(damages[i]);
			recurse(depth + 1, i, current);
			current.pop();

			if (results.length >= MAX_COMBOS * 3) return;
		}
	}

	recurse(0, 0, []);
}

function normalizeMinMaxType(damageType: string): string {
	return damageType
		.replace(/_MIN$/, "")
		.replace(/_MAX$/, "")
		.replace(/^NORMAL$/, "NORMAL_RANGE");
}

function isMinVariant(damageType: string): boolean {
	return damageType.endsWith("_MIN");
}

function deduplicateCombos(combos: ComboCandidate[]): ComboCandidate[] {
	const seen = new Set<string>();
	const unique: ComboCandidate[] = [];

	for (const combo of combos) {
		const key = combo.sources
			.map(
				(s) =>
					`${s.weaponSlot}-${s.sourceType}-${s.damageType}-${s.damage.toFixed(1)}`,
			)
			.sort()
			.join("|");

		if (!seen.has(key)) {
			seen.add(key);
			unique.push(combo);
		}
	}

	return unique;
}

function filterSameWeaponCombos(
	combos: ComboCandidate[],
	weaponIds: MainWeaponId[],
): ComboCandidate[] {
	const weaponCounts = new Map<MainWeaponId, number>();
	for (const id of weaponIds) {
		weaponCounts.set(id, (weaponCounts.get(id) ?? 0) + 1);
	}

	return combos.filter((combo) => {
		const slots = new Set(combo.sources.map((s) => s.weaponSlot));
		if (slots.size > 1) return true;

		const singleSlot = combo.sources[0].weaponSlot;
		const weaponId = weaponIds[singleSlot];
		const count = weaponCounts.get(weaponId) ?? 1;

		return count >= combo.sources.length;
	});
}

function filterMinMaxDuplicates(combos: ComboCandidate[]): ComboCandidate[] {
	const combosByNormalizedKey = new Map<string, ComboCandidate[]>();

	for (const combo of combos) {
		const normalizedKey = combo.sources
			.map(
				(s) =>
					`${s.weaponSlot}-${s.sourceType}-${normalizeMinMaxType(s.damageType)}`,
			)
			.sort()
			.join("|");

		const existing = combosByNormalizedKey.get(normalizedKey) ?? [];
		existing.push(combo);
		combosByNormalizedKey.set(normalizedKey, existing);
	}

	const filtered: ComboCandidate[] = [];

	for (const group of combosByNormalizedKey.values()) {
		if (group.length === 1) {
			filtered.push(group[0]);
			continue;
		}

		const hasMinVariant = group.some((c) =>
			c.sources.some((s) => isMinVariant(s.damageType)),
		);

		if (hasMinVariant) {
			const minCombos = group.filter((c) =>
				c.sources.some((s) => isMinVariant(s.damageType)),
			);
			filtered.push(minCombos[0]);
		} else {
			filtered.push(group[0]);
		}
	}

	return filtered;
}

function sortCombos(combos: ComboCandidate[]): ComboCandidate[] {
	return combos.sort((a, b) => {
		if (a.sources.length !== b.sources.length) {
			return a.sources.length - b.sources.length;
		}

		const aMainCount = a.sources.filter((s) => s.sourceType === "MAIN").length;
		const bMainCount = b.sources.filter((s) => s.sourceType === "MAIN").length;
		if (aMainCount !== bMainCount) {
			return bMainCount - aMainCount;
		}

		return a.totalDamage - b.totalDamage;
	});
}

export function findDamageCombos(weaponIds: MainWeaponId[]): DamageCombo[] {
	const allDamages: DamageSource[] = [];

	for (let slot = 0; slot < weaponIds.length; slot++) {
		const weapon = extractWeaponDamages(weaponIds[slot], slot);
		allDamages.push(...weapon.damages);
	}

	const comboDamages = allDamages.filter((d) => d.damage < TARGET_DAMAGE);

	const rawCombos = generateCombos(comboDamages, TARGET_DAMAGE, MAX_HITS);
	const uniqueCombos = deduplicateCombos(rawCombos);
	const noSelfCombos = filterSameWeaponCombos(uniqueCombos, weaponIds);
	const filteredCombos = filterMinMaxDuplicates(noSelfCombos);
	const sortedCombos = sortCombos(filteredCombos);

	return sortedCombos.slice(0, MAX_COMBOS).map((combo, index) => ({
		id: `combo-${index}`,
		sources: combo.sources,
		totalDamage: combo.totalDamage,
		hitCount: combo.sources.length,
	}));
}
