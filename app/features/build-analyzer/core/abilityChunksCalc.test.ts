import { describe, expect, test } from "vitest";
import type {
	AbilityWithUnknown,
	BuildAbilitiesTupleWithUnknown,
} from "~/modules/in-game-lists";
import { getAbilityChunksMapAsArray } from "./abilityChunksCalc";

// Utility function that performs an order-agnostic check to see
//  if the abilityChunksArray contains all elements from the expected output.
function validateAbilityChunksArray(
	abilityChunksArray: [AbilityWithUnknown, number][],
	expectedOutput: (string | number)[][],
) {
	for (const output of expectedOutput) {
		const typedOutput = output as [AbilityWithUnknown, number];
		const isFoundInAbilityChunksArray = abilityChunksArray.filter(
			(result) => JSON.stringify(result) === JSON.stringify(typedOutput),
		).length;

		const errorString = `${JSON.stringify(
			typedOutput,
		)} was not found in the actual output.\nExpected output: ${JSON.stringify(
			expectedOutput,
		)}\nActual Output: ${JSON.stringify(abilityChunksArray)}`;

		expect(isFoundInAbilityChunksArray, errorString).toBeTruthy();
	}
}

describe("getAbilityChunksMapAsArray()", () => {
	test("Empty build results in an empty array", () => {
		const emptyBuild = [
			["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
			["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
			["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
		] as unknown as BuildAbilitiesTupleWithUnknown;

		const abilityChunksArray = getAbilityChunksMapAsArray(emptyBuild);
		expect(
			abilityChunksArray,
			"Ability chunks array is not empty.",
		).toHaveLength(0);
	});

	describe("getAbilityChunksMapAsArray()", () => {
		test("Empty build results in an empty array", () => {
			const emptyBuild = [
				["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
				["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
				["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
			] as unknown as BuildAbilitiesTupleWithUnknown;

			const abilityChunksArray = getAbilityChunksMapAsArray(emptyBuild);
			expect(
				abilityChunksArray,
				"Ability chunks array is not empty.",
			).toHaveLength(0);
		});

		test("Ability Doubler ability does not count towards Ability Chunks", () => {
			const buildWithOnlyAbilityDoubler = [
				["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
				["AD", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
				["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
			] as unknown as BuildAbilitiesTupleWithUnknown;

			const abilityChunksArray = getAbilityChunksMapAsArray(
				buildWithOnlyAbilityDoubler,
			);
			expect(abilityChunksArray).toEqual([]);
		});

		test("Main Ability stackable ability chunk calculation is correct", () => {
			const build = [
				["ISS", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
				["ISM", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
				["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
			] as unknown as BuildAbilitiesTupleWithUnknown;

			const expectedOutput: any = [
				["ISM", 45],
				["ISS", 45],
			];

			const abilityChunksArray = getAbilityChunksMapAsArray(build);
			validateAbilityChunksArray(abilityChunksArray, expectedOutput);
		});

		test("Ninja Squid ability chunk calculation is correct (for a primary slot-only ability)", () => {
			const build = [
				["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
				["NS", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
				["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
			] as unknown as BuildAbilitiesTupleWithUnknown;

			const expectedOutput: any = [
				["IRU", 15],
				["RSU", 15],
				["SSU", 15],
			];

			const abilityChunksArray = getAbilityChunksMapAsArray(build);
			validateAbilityChunksArray(abilityChunksArray, expectedOutput);
		});

		test("Ability chunk calculation is correct for a real build. Each gear has 1, 2 or 3 ability chunks of same type", () => {
			const slayerBuild = [
				["LDE", "SSU", "SSU", "SSU"],
				["NS", "QR", "QR", "ISM"],
				["SJ", "SSU", "RES", "QSJ"],
			] as unknown as BuildAbilitiesTupleWithUnknown;

			const expectedOutput: any = [
				["SSU", 85],
				["IRU", 30],
				["QR", 30],
				["ISM", 25],
				["QSJ", 25],
				["IA", 15],
				["ISS", 15],
				["RSU", 15],
				["SRU", 15],
				["RES", 10],
			];

			const abilityChunksArray = getAbilityChunksMapAsArray(slayerBuild);
			validateAbilityChunksArray(abilityChunksArray, expectedOutput);
		});

		test("Ability chunk calculation is correct for a real build (Splatling)", () => {
			const splatlingBuild = [
				["RSU", "QSJ", "SSU", "RSU"],
				["RSU", "ISM", "ISM", "RSU"],
				["OS", "SSU", "SSU", "RES"],
			] as unknown as BuildAbilitiesTupleWithUnknown;

			const expectedOutput: any = [
				["RSU", 110],
				["SSU", 40],
				["ISM", 30],
				["BRU", 15],
				["IRU", 15],
				["SPU", 15],
				["QSJ", 10],
				["RES", 10],
			];

			const abilityChunksArray = getAbilityChunksMapAsArray(splatlingBuild);
			validateAbilityChunksArray(abilityChunksArray, expectedOutput);
		});

		test("Sub abilities chunk calculation with Ability Doubler in Clothing slot is correct", () => {
			const build = [
				["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
				["AD", "SSU", "SSU", "ISM"],
				["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
			] as unknown as BuildAbilitiesTupleWithUnknown;

			const expectedOutput: any = [
				["SSU", 9],
				["ISM", 3],
			];

			const abilityChunksArray = getAbilityChunksMapAsArray(build);
			validateAbilityChunksArray(abilityChunksArray, expectedOutput);
		});
	});
});
