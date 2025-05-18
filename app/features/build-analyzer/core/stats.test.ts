import { describe, expect, test } from "vitest";
import { type MainWeaponId, mainWeaponIds } from "~/modules/in-game-lists";
import { damageTypeToWeaponType } from "../analyzer-constants";
import { buildStats } from "./stats";

describe("Analyze build", () => {
	test("Every main weapon has damage", () => {
		const weaponsWithoutDamage: MainWeaponId[] = [];

		for (const weaponSplId of mainWeaponIds) {
			const analyzed = buildStats({
				weaponSplId,
				hasTacticooler: false,
			});

			const hasDamage =
				analyzed.stats.damages.filter(
					(dmg) => damageTypeToWeaponType[dmg.type] === "MAIN",
				).length > 0;

			if (!hasDamage) {
				weaponsWithoutDamage.push(weaponSplId);
			}
		}

		expect(
			weaponsWithoutDamage.length,
			`Weapons without damage set: ${weaponsWithoutDamage.join(", ")}`,
		).toBe(0);
	});

	test("Ninja Squid decreases swim speed", () => {
		const analyzed = buildStats({
			weaponSplId: 0,
			hasTacticooler: false,
		});

		const analyzedWithNS = buildStats({
			weaponSplId: 0,
			mainOnlyAbilities: ["NS"],
			hasTacticooler: false,
		});

		expect(analyzed.stats.swimSpeed.value).toBeGreaterThan(
			analyzedWithNS.stats.swimSpeed.value,
		);
	});

	test("Tacticooler / RP calculated correctly", () => {
		const fullQR = buildStats({
			weaponSplId: 0,
			abilityPoints: new Map([["QR", 57]]),
			hasTacticooler: false,
		});

		const tacticooler = buildStats({
			weaponSplId: 0,
			abilityPoints: new Map([["QR", 57]]),
			hasTacticooler: true,
		});

		expect(
			fullQR.stats.quickRespawnTime.value,
			"Base QR should be same whether 57AP of QR or Tacticooler",
		).toBe(tacticooler.stats.quickRespawnTime.value);
		expect(
			fullQR.stats.quickRespawnTimeSplattedByRP.value,
			"Tacticooler splatted by RP should respawn faster than 57AP of QR",
		).toBeGreaterThan(tacticooler.stats.quickRespawnTimeSplattedByRP.value);
		expect(
			tacticooler.stats.quickRespawnTime.value,
			"Tacticooler should respawn faster than Tacticooler splatted by RP",
		).toBeLessThan(tacticooler.stats.quickRespawnTimeSplattedByRP.value);
	});

	test("Accounts for Jr. big ink tank with sub weapon ink consumption %", () => {
		const analyzedDualieSquelchers = buildStats({
			weaponSplId: 5030,
			hasTacticooler: false,
		});

		const analyzedJr = buildStats({
			weaponSplId: 10,
			hasTacticooler: false,
		});

		expect(
			analyzedDualieSquelchers.stats.subWeaponInkConsumptionPercentage.value,
		).toBeGreaterThan(analyzedJr.stats.subWeaponInkConsumptionPercentage.value);
	});

	const subPowerApToQuickSuperJumpAp = new Map([
		[0, 0],
		[3, 4],
		[6, 9],
		[13, 18],
		[28, 36],
		[57, 57],
	]);

	test("Sub Power Up Beakon AP boost matches Lean", () => {
		for (const [subPowerAp, quickSuperJumpAp] of subPowerApToQuickSuperJumpAp) {
			const analyzed = buildStats({
				weaponSplId: 1011,
				abilityPoints: new Map([["BRU" as const, subPowerAp]]),
				hasTacticooler: false,
			});

			expect(
				analyzed.stats.subQsjBoost?.value,
				`Wrong AP boost for ${subPowerAp}AP of Sub Power Up: ${
					analyzed.stats.subQsjBoost!.value
				} (expected ${quickSuperJumpAp}))`,
			).toBe(quickSuperJumpAp);
		}
	});
});
