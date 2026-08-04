import { describe, expect, test } from "vitest";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import { roundToNDecimalPlaces } from "~/utils/number";
import { damageTypeToWeaponType } from "../analyzer-constants";
import { buildStats } from "./stats";
import { mainWeaponParams } from "./utils";

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

	test("Tenacity special charge time is only calculated with Tenacity in the build", () => {
		const analyzed = buildStats({
			weaponSplId: 0,
			hasTacticooler: false,
		});

		const analyzedWithTenacity = buildStats({
			weaponSplId: 0,
			mainOnlyAbilities: ["T"],
			hasTacticooler: false,
		});

		expect(analyzed.stats.tenacitySecondsToSpecial).toBeUndefined();
		expect(analyzedWithTenacity.stats.tenacitySecondsToSpecial).toBeDefined();
	});

	test("Tenacity special charge time is not affected by Special Charge Up", () => {
		const analyzed = buildStats({
			weaponSplId: 0,
			mainOnlyAbilities: ["T"],
			hasTacticooler: false,
		});

		const analyzedWithSCU = buildStats({
			weaponSplId: 0,
			abilityPoints: new Map([["SCU", 57]]),
			mainOnlyAbilities: ["T"],
			hasTacticooler: false,
		});

		expect(
			analyzedWithSCU.stats.specialPoint.value,
			"Special Charge Up should lower the points needed for special",
		).toBeLessThan(analyzed.stats.specialPoint.value);
		expect(analyzedWithSCU.stats.tenacitySecondsToSpecial).toEqual(
			analyzed.stats.tenacitySecondsToSpecial,
		);
	});

	test("Tenacity fills the special gauge faster the more players the team is down", () => {
		const analyzed = buildStats({
			weaponSplId: 0,
			mainOnlyAbilities: ["T"],
			hasTacticooler: false,
		});

		const secondsToSpecial = analyzed.stats.tenacitySecondsToSpecial!;

		expect(secondsToSpecial[2]).toBeLessThan(secondsToSpecial[1]);
		expect(secondsToSpecial[3]).toBeLessThan(secondsToSpecial[2]);
	});

	const subPowerApToQuickSuperJumpAp = new Map([
		[0, 0],
		[3, 4],
		[6, 9],
		[13, 18],
		[28, 36],
		[57, 57],
	]);

	test("Main weapon ink consumption % exists per ink consume type of the weapon", () => {
		const analyzedCharger = buildStats({
			weaponSplId: 2010,
			hasTacticooler: false,
		});

		expect(
			analyzedCharger.stats.mainWeaponInkConsumptionPercentage_TAP_SHOT,
		).toBeDefined();
		expect(
			analyzedCharger.stats.mainWeaponInkConsumptionPercentage_FULL_CHARGE,
		).toBeDefined();
		expect(
			analyzedCharger.stats.mainWeaponInkConsumptionPercentage_NORMAL,
		).toBeUndefined();
	});

	test("ISM decreases main weapon ink consumption %", () => {
		const analyzed = buildStats({
			weaponSplId: 0,
			hasTacticooler: false,
		});

		const analyzedWithISM = buildStats({
			weaponSplId: 0,
			abilityPoints: new Map([["ISM", 20]]),
			hasTacticooler: false,
		});

		const stat = analyzed.stats.mainWeaponInkConsumptionPercentage_NORMAL!;
		const statWithISM =
			analyzedWithISM.stats.mainWeaponInkConsumptionPercentage_NORMAL!;

		expect(stat.value).toBe(stat.baseValue);
		expect(statWithISM.baseValue).toBe(stat.baseValue);
		expect(statWithISM.value).toBeLessThan(statWithISM.baseValue);
	});

	test("Accounts for Jr. big ink tank with main weapon ink consumption %", () => {
		const analyzedJr = buildStats({
			weaponSplId: 10,
			hasTacticooler: false,
		});

		const jrParams = mainWeaponParams(10);

		expect(
			analyzedJr.stats.mainWeaponInkConsumptionPercentage_NORMAL?.baseValue,
		).toBe(roundToNDecimalPlaces((jrParams.InkConsume! * 100) / 1.1));
	});

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
