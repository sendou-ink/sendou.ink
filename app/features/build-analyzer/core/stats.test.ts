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

			const hasDamage = analyzed.stats.damages.some(
				(dmg) => damageTypeToWeaponType[dmg.type] === "MAIN",
			);

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

	test.each([
		{ why: "Painbrush", weaponSplId: 1120, expected: 0.833 },
		{ why: "Splatana Stamper", weaponSplId: 8000, expected: 0.667 },
		{ why: "Tenta Brella", weaponSplId: 6010, expected: 1.167 },
	] as const)(
		"Main weapon no ink recovery time comes from the weapon's action params ($why)",
		({ weaponSplId, expected }) => {
			const analyzed = buildStats({ weaponSplId, hasTacticooler: false });

			expect(analyzed.stats.mainWeaponWhiteInkSeconds).toBe(expected);
		},
	);

	test("S-BLAST '92 jumping blast has its own radius", () => {
		const analyzed = buildStats({ weaponSplId: 260, hasTacticooler: false });

		const jumpDamages = analyzed.stats.damages.filter(
			(damage) => damage.type === "DISTANCE_JUMP",
		);

		expect(jumpDamages.map((damage) => damage.distance)).toEqual([
			0.975, 3.635,
		]);
	});

	test("Roller no ink recovery time is split by swing direction", () => {
		const analyzed = buildStats({ weaponSplId: 1010, hasTacticooler: false });

		expect(analyzed.stats.mainWeaponWhiteInkSeconds).toBeUndefined();
		expect(analyzed.stats.mainWeaponWhiteInkSecondsHorizontalSwing).toBe(0.717);
		expect(analyzed.stats.mainWeaponWhiteInkSecondsVerticalSwing).toBe(0.967);
	});

	test("Squeezer rapid fire has its own ink consumption and run speed", () => {
		const analyzed = buildStats({
			weaponSplId: 400,
			hasTacticooler: false,
		});

		expect(
			analyzed.stats.mainWeaponInkConsumptionPercentage_SECONDARY_MODE!
				.baseValue,
		).toBeLessThan(
			analyzed.stats.mainWeaponInkConsumptionPercentage_NORMAL!.baseValue,
		);
		expect(analyzed.stats.shootingRunSpeedSecondaryMode!.baseValue).toBe(0.72);
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

	test("Rolling time on a full tank only exists for rollers and brushes", () => {
		const splatRoller = buildStats({
			weaponSplId: 1010,
			hasTacticooler: false,
		});
		const inkbrush = buildStats({ weaponSplId: 1100, hasTacticooler: false });
		const splattershot = buildStats({ weaponSplId: 40, hasTacticooler: false });

		expect(splatRoller.stats.mainWeaponRollSeconds?.baseValue).toBe(16.667);
		expect(inkbrush.stats.mainWeaponRollSeconds?.baseValue).toBe(13.333);
		expect(splattershot.stats.mainWeaponRollSeconds).toBeUndefined();
	});

	test("ISM increases rolling time on a full tank", () => {
		const analyzed = buildStats({ weaponSplId: 1100, hasTacticooler: false });
		const analyzedWithISM = buildStats({
			weaponSplId: 1100,
			abilityPoints: new Map([["ISM", 20]]),
			hasTacticooler: false,
		});

		const stat = analyzed.stats.mainWeaponRollSeconds!;
		const statWithISM = analyzedWithISM.stats.mainWeaponRollSeconds!;

		expect(statWithISM.baseValue).toBe(stat.baseValue);
		expect(statWithISM.value).toBeGreaterThan(statWithISM.baseValue);
	});

	test("RES increases jump height in enemy ink", () => {
		const analyzed = buildStats({
			weaponSplId: 40,
			abilityPoints: new Map([["RES", 57]]),
			hasTacticooler: false,
		});

		expect(analyzed.stats.jumpHeightInEnemyInk.baseValue).toBe(0.8);
		expect(analyzed.stats.jumpHeightInEnemyInk.value).toBe(1.1);
	});

	test("IA removes the speed loss of consecutive Squid Rolls", () => {
		const analyzed = buildStats({
			weaponSplId: 40,
			abilityPoints: new Map([["IA", 57]]),
			hasTacticooler: false,
		});

		expect(analyzed.stats.squidRollSpeedRetained.baseValue).toBe(85);
		expect(analyzed.stats.squidRollSpeedRetained.value).toBe(100);
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

	test.each([
		{ why: "Sploosh 64.995", weaponSplId: 0, iss: 9, ism: 16, expected: 64.99 },
		{
			why: "Sploosh 101.998",
			weaponSplId: 0,
			iss: 15,
			ism: 57,
			expected: 101.99,
		},
		{
			why: "Jr. just under 100",
			weaponSplId: 10,
			iss: 3,
			ism: 1,
			expected: 99.99,
		},
	] as const)(
		"Full ink tank actions are truncated, not rounded up ($why)",
		({ weaponSplId, iss, ism, expected }) => {
			const analyzed = buildStats({
				weaponSplId,
				abilityPoints: new Map([
					["ISS", iss],
					["ISM", ism],
				]),
				hasTacticooler: false,
			});

			const oneSubOption = analyzed.stats.fullInkTankOptions.find(
				(option) => option.subsUsed === 1,
			);

			expect(oneSubOption?.value).toBe(expected);
		},
	);

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
