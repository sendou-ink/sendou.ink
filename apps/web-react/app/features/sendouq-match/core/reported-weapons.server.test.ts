import { describe, expect, test } from "vitest";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { mergeReportedWeapons } from "./reported-weapons.server";

describe("mergeReportedWeapons()", () => {
	const newWeapons = [
		{
			groupMatchId: 1,
			mapIndex: 0,
			userId: 1,
			weaponSplId: 0 as MainWeaponId,
		},
	];

	test("handles no old weapons", () => {
		const result = mergeReportedWeapons({ newWeapons, oldWeapons: [] });

		expect(result).toEqual(newWeapons);
	});

	test("replaces a weapon", () => {
		const result = mergeReportedWeapons({
			newWeapons,
			oldWeapons: [
				{
					groupMatchId: 1,
					mapIndex: 0,
					userId: 1,
					weaponSplId: 1 as MainWeaponId,
				},
			],
		});

		expect(result).toEqual(newWeapons);
	});

	test("merges two completely separate lists", () => {
		const result = mergeReportedWeapons({
			newWeapons,
			oldWeapons: [
				{
					groupMatchId: 1,
					mapIndex: 0,
					userId: 2,
					weaponSplId: 0 as MainWeaponId,
				},
			],
		});

		expect(result).toEqual([
			{
				groupMatchId: 1,
				mapIndex: 0,
				userId: 2,
				weaponSplId: 0 as MainWeaponId,
			},
			...newWeapons,
		]);
	});

	test("handles merging partially same list", () => {
		const result = mergeReportedWeapons({
			newWeapons,
			oldWeapons: [
				{
					groupMatchId: 1,
					mapIndex: 0,
					userId: 1,
					weaponSplId: 1 as MainWeaponId,
				},
				{
					groupMatchId: 1,
					mapIndex: 0,
					userId: 2,
					weaponSplId: 0 as MainWeaponId,
				},
			],
		});

		expect(result).toEqual([
			...newWeapons,
			{
				groupMatchId: 1,
				mapIndex: 0,
				userId: 2,
				weaponSplId: 0 as MainWeaponId,
			},
		]);
	});

	test("slices unplayed maps", () => {
		const result = mergeReportedWeapons({
			newWeapons,
			oldWeapons: [
				{
					groupMatchId: 1,
					mapIndex: 1,
					userId: 1,
					weaponSplId: 0 as MainWeaponId,
				},
			],
			newReportedMapsCount: 1,
		});

		expect(result).toEqual(newWeapons);
	});
});
