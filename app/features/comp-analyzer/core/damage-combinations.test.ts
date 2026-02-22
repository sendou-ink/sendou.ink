import { describe, expect, test } from "vitest";
import {
	COMBO_DAMAGE_THRESHOLD,
	MAX_COMBOS_DISPLAYED,
	MAX_DAMAGE_TYPES_PER_COMBO,
	MAX_REPEATS_PER_DAMAGE_TYPE,
} from "../comp-analyzer-constants";
import {
	calculateDamageCombos,
	calculateInkTimeToKill,
	extractDamageSources,
} from "./damage-combinations";

const SPLATTERSHOT_ID = 40;
const SPLAT_ROLLER_ID = 1010;
const SPLAT_CHARGER_ID = 2010;
const AEROSPRAY_MG_ID = 30;
const SPLATTERSHOT_JR_ID = 10;
const EXPLOSHER_ID = 3040;

describe("extractDamageSources", () => {
	test("extracts main weapon damages", () => {
		const sources = extractDamageSources([SPLATTERSHOT_ID]);

		expect(sources.length).toBe(1);
		expect(sources[0].weaponId).toBe(SPLATTERSHOT_ID);
		expect(sources[0].weaponSlot).toBe(0);

		const mainDamages = sources[0].damages.filter(
			(d) => d.weaponType === "MAIN",
		);
		expect(mainDamages.length).toBeGreaterThan(0);
	});

	test("extracts sub weapon damages", () => {
		const sources = extractDamageSources([SPLATTERSHOT_ID]);

		const subDamages = sources[0].damages.filter((d) => d.weaponType === "SUB");
		expect(subDamages.length).toBeGreaterThan(0);
	});

	test("extracts special weapon damages when applicable", () => {
		const sources = extractDamageSources([SPLATTERSHOT_ID]);

		const specialDamages = sources[0].damages.filter(
			(d) => d.weaponType === "SPECIAL",
		);
		expect(specialDamages.length).toBeGreaterThan(0);
	});

	test("assigns correct weapon slots for multiple weapons", () => {
		const sources = extractDamageSources([
			SPLATTERSHOT_ID,
			SPLAT_ROLLER_ID,
			SPLAT_CHARGER_ID,
		]);

		expect(sources.length).toBe(3);
		expect(sources[0].weaponSlot).toBe(0);
		expect(sources[1].weaponSlot).toBe(1);
		expect(sources[2].weaponSlot).toBe(2);
	});
});

describe("calculateDamageCombos - basic combination generation", () => {
	test("generates combos involving 2+ weapons", () => {
		const combos = calculateDamageCombos([SPLATTERSHOT_ID, SPLAT_ROLLER_ID]);

		expect(combos.length).toBeGreaterThan(0);

		for (const combo of combos) {
			const uniqueSlots = new Set(combo.segments.map((s) => s.weaponSlot));
			expect(uniqueSlots.size).toBeGreaterThanOrEqual(2);
		}
	});

	test("calculates correct total damage", () => {
		const combos = calculateDamageCombos([SPLATTERSHOT_ID, SPLAT_ROLLER_ID]);

		for (const combo of combos) {
			const calculatedTotal = combo.segments.reduce(
				(sum, segment) => sum + segment.damageValue * segment.count,
				0,
			);
			expect(combo.totalDamage).toBeCloseTo(calculatedTotal, 1);
		}
	});

	test("calculates correct hit count", () => {
		const combos = calculateDamageCombos([SPLATTERSHOT_ID, SPLAT_ROLLER_ID]);

		for (const combo of combos) {
			const calculatedHitCount = combo.segments.reduce(
				(sum, segment) => sum + segment.count,
				0,
			);
			expect(combo.hitCount).toBe(calculatedHitCount);
		}
	});
});

describe("calculateDamageCombos - constraint enforcement", () => {
	test("respects max damage types per combo constraint", () => {
		const combos = calculateDamageCombos([
			SPLATTERSHOT_ID,
			SPLAT_ROLLER_ID,
			SPLAT_CHARGER_ID,
			AEROSPRAY_MG_ID,
		]);

		for (const combo of combos) {
			const uniqueTypes = new Set(combo.segments.map((s) => s.damageType));
			expect(uniqueTypes.size).toBeLessThanOrEqual(MAX_DAMAGE_TYPES_PER_COMBO);
		}
	});

	test("respects max repeats per damage type constraint", () => {
		const combos = calculateDamageCombos([
			SPLATTERSHOT_ID,
			SPLAT_ROLLER_ID,
			SPLAT_CHARGER_ID,
			AEROSPRAY_MG_ID,
		]);

		for (const combo of combos) {
			const typeToCount = new Map<string, number>();
			for (const segment of combo.segments) {
				const current = typeToCount.get(segment.damageType) ?? 0;
				typeToCount.set(segment.damageType, current + segment.count);
			}

			for (const [type, count] of typeToCount) {
				expect(
					count,
					`Type ${type} has ${count} uses, max is ${MAX_REPEATS_PER_DAMAGE_TYPE}`,
				).toBeLessThanOrEqual(MAX_REPEATS_PER_DAMAGE_TYPE);
			}
		}
	});

	test("requires 2+ weapon slots in each combo", () => {
		const combos = calculateDamageCombos([
			SPLATTERSHOT_ID,
			SPLAT_ROLLER_ID,
			SPLAT_CHARGER_ID,
		]);

		for (const combo of combos) {
			const uniqueSlots = new Set(combo.segments.map((s) => s.weaponSlot));
			expect(uniqueSlots.size).toBeGreaterThanOrEqual(2);
		}
	});
});

describe("calculateDamageCombos - threshold filtering", () => {
	test("excludes combos below damage threshold", () => {
		const combos = calculateDamageCombos([SPLATTERSHOT_ID, SPLAT_ROLLER_ID]);

		for (const combo of combos) {
			expect(combo.totalDamage).toBeGreaterThanOrEqual(COMBO_DAMAGE_THRESHOLD);
		}
	});

	test("includes combos at or above damage threshold", () => {
		const combos = calculateDamageCombos([SPLATTERSHOT_ID, SPLAT_ROLLER_ID]);

		const hasValidCombos = combos.some(
			(c) => c.totalDamage >= COMBO_DAMAGE_THRESHOLD,
		);
		expect(hasValidCombos).toBe(true);
	});
});

describe("calculateDamageCombos - one-shot exclusion", () => {
	test("excludes all combos containing a 100+ damage hit", () => {
		const combos = calculateDamageCombos([SPLAT_CHARGER_ID, SPLATTERSHOT_ID]);

		for (const combo of combos) {
			const hasOneShot = combo.segments.some((s) => s.damageValue >= 100);
			expect(hasOneShot).toBe(false);
		}
	});
});

describe("calculateDamageCombos - sorting", () => {
	test("sorts results by totalDamage closest to 100 (lethal threshold)", () => {
		const combos = calculateDamageCombos([
			SPLATTERSHOT_ID,
			SPLAT_ROLLER_ID,
			SPLAT_CHARGER_ID,
		]);

		if (combos.length < 2) {
			return;
		}

		for (let i = 0; i < combos.length - 1; i++) {
			const currentDistTo100 = Math.abs(combos[i].totalDamage - 100);
			const nextDistTo100 = Math.abs(combos[i + 1].totalDamage - 100);
			expect(currentDistTo100).toBeLessThanOrEqual(nextDistTo100);
		}
	});
});

describe("calculateDamageCombos - result cap", () => {
	test("returns at most MAX_COMBOS_DISPLAYED results", () => {
		const combos = calculateDamageCombos([
			SPLATTERSHOT_ID,
			SPLAT_ROLLER_ID,
			SPLAT_CHARGER_ID,
			AEROSPRAY_MG_ID,
		]);

		expect(combos.length).toBeLessThanOrEqual(MAX_COMBOS_DISPLAYED);
	});
});

describe("calculateDamageCombos - edge cases", () => {
	test("returns empty array for empty weapon selection", () => {
		const combos = calculateDamageCombos([]);

		expect(combos).toEqual([]);
	});

	test("returns empty array for single weapon (cannot make cross-weapon combos)", () => {
		const combos = calculateDamageCombos([SPLATTERSHOT_ID]);

		expect(combos).toEqual([]);
	});

	test("same sub weapon on multiple weapons creates valid combos", () => {
		const combos = calculateDamageCombos([SPLATTERSHOT_ID, SPLATTERSHOT_JR_ID]);

		expect(combos.length).toBeGreaterThanOrEqual(0);

		for (const combo of combos) {
			const uniqueSlots = new Set(combo.segments.map((s) => s.weaponSlot));
			expect(uniqueSlots.size).toBeGreaterThanOrEqual(2);
		}
	});

	test("all segments have valid weapon slot assignments", () => {
		const combos = calculateDamageCombos([SPLATTERSHOT_ID, SPLAT_ROLLER_ID]);

		for (const combo of combos) {
			for (const segment of combo.segments) {
				expect(segment.weaponSlot).toBeGreaterThanOrEqual(0);
				expect(segment.weaponSlot).toBeLessThan(4);
			}
		}
	});

	test("all segments have count of 1 or 2", () => {
		const combos = calculateDamageCombos([
			SPLATTERSHOT_ID,
			SPLAT_ROLLER_ID,
			SPLAT_CHARGER_ID,
		]);

		for (const combo of combos) {
			for (const segment of combo.segments) {
				expect(segment.count).toBeGreaterThanOrEqual(1);
				expect(segment.count).toBeLessThanOrEqual(2);
			}
		}
	});
});

describe("calculateInkTimeToKill", () => {
	test("returns null for combos that are already lethal (>= 100 damage)", () => {
		const result = calculateInkTimeToKill(100, 0);
		expect(result).toBeNull();
	});

	test("returns null for combos above 100 damage", () => {
		const result = calculateInkTimeToKill(150, 0);
		expect(result).toBeNull();
	});

	test("calculates short ink time for 99 damage combo with 0 RES", () => {
		const result = calculateInkTimeToKill(99, 0);

		expect(result).not.toBeNull();
		expect(result).toBeGreaterThan(0);
		expect(result).toBeLessThan(30);
	});

	test("calculates longer ink time for 80 damage combo with 0 RES", () => {
		const result = calculateInkTimeToKill(80, 0);

		expect(result).not.toBeNull();
		expect(result).toBeGreaterThan(60);
	});

	test("returns null when remaining damage exceeds ink damage limit with high RES", () => {
		const result = calculateInkTimeToKill(60, 57);

		expect(result).toBeNull();
	});

	test("higher RES increases ink time", () => {
		const resultNoRes = calculateInkTimeToKill(90, 0);
		const resultMaxRes = calculateInkTimeToKill(90, 57);

		expect(resultNoRes).not.toBeNull();
		expect(resultMaxRes).not.toBeNull();
		expect(resultMaxRes!).toBeGreaterThan(resultNoRes!);
	});

	test("handles boundary case at 0 AP", () => {
		const result = calculateInkTimeToKill(80, 0);

		expect(result).not.toBeNull();
		expect(result).toBeGreaterThan(0);
	});

	test("handles boundary case at 57 AP", () => {
		const result = calculateInkTimeToKill(90, 57);

		expect(result).not.toBeNull();
		expect(result).toBeGreaterThan(0);
	});
});

describe("calculateDamageCombos - excessive combo filtering", () => {
	test("filters out excessive combos (200+ damage where removing any hit still kills)", () => {
		const combos = calculateDamageCombos(
			[SPLATTERSHOT_ID, SPLAT_ROLLER_ID, SPLAT_CHARGER_ID, AEROSPRAY_MG_ID],
			[],
			0,
			1000,
		);

		const hasExcessiveCombo = combos.some((combo) => {
			const flatDamages = combo.segments.flatMap((s) =>
				Array(s.count).fill(s.damageValue),
			);
			for (const damage of flatDamages) {
				const reducedDamage = combo.totalDamage - damage;
				if (reducedDamage >= 100) {
					return true;
				}
			}
			return false;
		});

		expect(hasExcessiveCombo).toBe(false);
	});

	test("allows combos where removing any hit drops below lethal threshold", () => {
		const combos = calculateDamageCombos(
			[SPLATTERSHOT_ID, SPLAT_ROLLER_ID],
			[],
			0,
			1000,
		);

		for (const combo of combos) {
			const flatDamages = combo.segments.flatMap((s) =>
				Array(s.count).fill(s.damageValue),
			);
			const allHitsNecessary = flatDamages.every(
				(damage) => combo.totalDamage - damage < 100,
			);
			expect(allHitsNecessary).toBe(true);
		}
	});
});

const TRI_SLOSHER_ID = 3010;
const INKBRUSH_ID = 1100;
const GOLD_DYNAMO_ROLLER_ID = 1021;
const RAPID_BLASTER_PRO_WNT_R_ID = 252;

describe("calculateDamageCombos - deduplication", () => {
	test("no duplicate combos with bug report weapons", () => {
		const combos = calculateDamageCombos(
			[
				TRI_SLOSHER_ID,
				INKBRUSH_ID,
				GOLD_DYNAMO_ROLLER_ID,
				RAPID_BLASTER_PRO_WNT_R_ID,
			],
			[],
			0,
			1000,
		);

		const canonicalKeys = combos.map((combo) => {
			const grouped = new Map<string, number>();
			for (const segment of combo.segments) {
				const key = `${segment.damageType}:${segment.damageValue}`;
				grouped.set(key, (grouped.get(key) ?? 0) + segment.count);
			}
			return [...grouped.entries()]
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, count]) => `${key}:${count}`)
				.join("|");
		});

		const uniqueKeys = new Set(canonicalKeys);
		expect(uniqueKeys.size).toBe(canonicalKeys.length);
	});
});

describe("virtual damage combos", () => {
	test("Explosher has COMBO damage type combining DIRECT and DISTANCE", () => {
		const sources = extractDamageSources([EXPLOSHER_ID]);
		const damages = sources[0].damages;

		const comboDamage = damages.find((d) => d.type === "COMBO");
		expect(comboDamage).toBeDefined();
		expect(comboDamage?.weaponType).toBe("MAIN");

		const directDamage = damages.find((d) => d.type === "DIRECT");
		const distanceDamage = damages.find((d) => d.type === "DISTANCE");

		expect(directDamage).toBeDefined();
		expect(distanceDamage).toBeDefined();

		const expectedComboValue =
			(directDamage?.value ?? 0) + (distanceDamage?.value ?? 0);
		expect(comboDamage?.value).toBeCloseTo(expectedComboValue, 1);
	});

	test("COMBO damage appears in damage combos", () => {
		const combos = calculateDamageCombos([EXPLOSHER_ID, SPLATTERSHOT_ID]);

		const comboWithComboType = combos.find((c) =>
			c.segments.some((s) => s.damageType === "COMBO"),
		);
		expect(comboWithComboType).toBeDefined();
	});
});
