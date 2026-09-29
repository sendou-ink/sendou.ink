import { describe, expect, test } from "vitest";
import type {
	Ability,
	BuildAbilitiesTupleWithUnknown,
} from "~/modules/in-game-lists/types";
import * as AbilitySlots from "./AbilitySlots";

const EMPTY_BUILD: BuildAbilitiesTupleWithUnknown = [
	["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
	["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
	["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
];

const FULL_SUBS_BUILD: BuildAbilitiesTupleWithUnknown = [
	["UNKNOWN", "ISM", "ISM", "ISM"],
	["UNKNOWN", "SSU", "SSU", "SSU"],
	["UNKNOWN", "QR", "QR", "QR"],
];

describe("AbilitySlots.canPlaceAt", () => {
	test.each<{
		why: string;
		ability: Ability;
		rowI: number;
		abilityI: number;
		expected: boolean;
	}>([
		{
			why: "stackable in main",
			ability: "ISM",
			rowI: 1,
			abilityI: 0,
			expected: true,
		},
		{
			why: "stackable in sub",
			ability: "ISM",
			rowI: 2,
			abilityI: 3,
			expected: true,
		},
		{
			why: "head-only in head main",
			ability: "OG",
			rowI: 0,
			abilityI: 0,
			expected: true,
		},
		{
			why: "head-only in clothes main",
			ability: "OG",
			rowI: 1,
			abilityI: 0,
			expected: false,
		},
		{
			why: "head-only in head sub",
			ability: "OG",
			rowI: 0,
			abilityI: 1,
			expected: false,
		},
		{
			why: "clothes-only in clothes main",
			ability: "AD",
			rowI: 1,
			abilityI: 0,
			expected: true,
		},
		{
			why: "shoes-only in shoes main",
			ability: "SJ",
			rowI: 2,
			abilityI: 0,
			expected: true,
		},
		{
			why: "shoes-only in head main",
			ability: "SJ",
			rowI: 0,
			abilityI: 0,
			expected: false,
		},
	])("$why", ({ ability, rowI, abilityI, expected }) => {
		expect(AbilitySlots.canPlaceAt(ability, { rowI, abilityI })).toBe(expected);
	});
});

describe("AbilitySlots.firstEmptyValidSlot", () => {
	test("returns the head main for a stackable in an empty build", () => {
		expect(AbilitySlots.firstEmptyValidSlot(EMPTY_BUILD, "ISM")).toEqual({
			rowI: 0,
			abilityI: 0,
		});
	});

	test("skips mains the ability is not legal in", () => {
		expect(AbilitySlots.firstEmptyValidSlot(EMPTY_BUILD, "SJ")).toEqual({
			rowI: 2,
			abilityI: 0,
		});
	});

	test("returns null for a main-only ability whose slot is taken", () => {
		const build = AbilitySlots.add(EMPTY_BUILD, "OG");

		expect(AbilitySlots.firstEmptyValidSlot(build, "LDE")).toBeNull();
	});

	test("returns null for a stackable when every slot is taken", () => {
		const build = AbilitySlots.add(
			AbilitySlots.add(AbilitySlots.add(FULL_SUBS_BUILD, "OG"), "AD"),
			"SJ",
		);

		expect(AbilitySlots.firstEmptyValidSlot(build, "ISM")).toBeNull();
	});
});

describe("AbilitySlots.add", () => {
	test("fills the first empty legal slot", () => {
		expect(AbilitySlots.add(FULL_SUBS_BUILD, "RES")[0]).toEqual([
			"RES",
			"ISM",
			"ISM",
			"ISM",
		]);
	});

	test("returns the build unchanged when there is no room", () => {
		const build = AbilitySlots.add(EMPTY_BUILD, "OG");

		expect(AbilitySlots.add(build, "LDE")).toBe(build);
	});

	test("does not mutate the input", () => {
		AbilitySlots.add(EMPTY_BUILD, "ISM");

		expect(EMPTY_BUILD[0][0]).toBe("UNKNOWN");
	});
});

describe("AbilitySlots.placeAt", () => {
	test("replaces an occupied slot", () => {
		expect(
			AbilitySlots.placeAt(FULL_SUBS_BUILD, "RES", { rowI: 0, abilityI: 2 })[0],
		).toEqual(["UNKNOWN", "ISM", "RES", "ISM"]);
	});

	test("ignores an illegal slot", () => {
		expect(
			AbilitySlots.placeAt(FULL_SUBS_BUILD, "OG", { rowI: 0, abilityI: 2 }),
		).toBe(FULL_SUBS_BUILD);
	});
});

describe("AbilitySlots.remove", () => {
	test("empties the slot", () => {
		expect(
			AbilitySlots.remove(FULL_SUBS_BUILD, { rowI: 1, abilityI: 1 })[1],
		).toEqual(["UNKNOWN", "UNKNOWN", "SSU", "SSU"]);
	});
});

describe("AbilitySlots.move", () => {
	test("moves to an empty slot", () => {
		const build = AbilitySlots.move(
			FULL_SUBS_BUILD,
			{ rowI: 0, abilityI: 1 },
			{ rowI: 1, abilityI: 0 },
		);

		expect(build[0]).toEqual(["UNKNOWN", "UNKNOWN", "ISM", "ISM"]);
		expect(build[1]).toEqual(["ISM", "SSU", "SSU", "SSU"]);
	});

	test("swaps with an occupied slot", () => {
		const build = AbilitySlots.move(
			FULL_SUBS_BUILD,
			{ rowI: 0, abilityI: 1 },
			{ rowI: 2, abilityI: 3 },
		);

		expect(build[0]).toEqual(["UNKNOWN", "QR", "ISM", "ISM"]);
		expect(build[2]).toEqual(["UNKNOWN", "QR", "QR", "ISM"]);
	});

	test("refuses when the displaced ability is not legal in the origin", () => {
		const build = AbilitySlots.add(FULL_SUBS_BUILD, "OG");
		const from = { rowI: 0, abilityI: 1 };
		const to = { rowI: 0, abilityI: 0 };

		expect(AbilitySlots.canMove(build, from, to)).toBe(false);
		expect(AbilitySlots.move(build, from, to)).toBe(build);
	});

	test("refuses when the moved ability is not legal in the target", () => {
		const build = AbilitySlots.add(EMPTY_BUILD, "OG");

		expect(
			AbilitySlots.canMove(
				build,
				{ rowI: 0, abilityI: 0 },
				{ rowI: 1, abilityI: 0 },
			),
		).toBe(false);
	});
});
