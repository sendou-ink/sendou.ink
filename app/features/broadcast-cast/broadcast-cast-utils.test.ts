import { describe, expect, test } from "vitest";
import { controlShares, needsFeaturedMatch } from "./broadcast-cast-utils";

describe("controlShares", () => {
	const read = (t: number, control: 0 | 1 | null) => ({
		t,
		data: {
			time: null,
			score: [null, null] as [null, null],
			penalty: [null, null] as [null, null],
			control,
		},
	});

	test("gives each team's share of the time from a read to the next one", () => {
		expect(
			controlShares([read(0, null), read(10, 0), read(40, 1), read(50, 1)]),
		).toEqual([0.6, 0.2]);
	});

	test("counts the reads in time order", () => {
		expect(controlShares([read(10, null), read(0, 1)])).toEqual([0, 1]);
	});

	test.each([
		{ why: "no reads", events: [] },
		{ why: "a single read", events: [read(5, 0)] },
	])("gives nothing for $why", ({ events }) => {
		expect(controlShares(events)).toEqual([0, 0]);
	});
});

describe("needsFeaturedMatch", () => {
	test.each([
		{ why: "rosters", scene: "rosters", teamPick: undefined, expected: true },
		{ why: "maps", scene: "maps", teamPick: undefined, expected: true },
		{ why: "results", scene: "results", teamPick: undefined, expected: true },
		{
			why: "team following a side",
			scene: "team",
			teamPick: "left",
			expected: true,
		},
		{ why: "team picked by id", scene: "team", teamPick: 5, expected: false },
		{
			why: "team without a pick",
			scene: "team",
			teamPick: undefined,
			expected: false,
		},
		{ why: "game", scene: "game", teamPick: undefined, expected: false },
		{ why: "replays", scene: "replays", teamPick: undefined, expected: false },
		{ why: "bracket", scene: "bracket", teamPick: undefined, expected: false },
		{ why: "casters", scene: "casters", teamPick: undefined, expected: false },
		{
			why: "a hold scene",
			scene: "break",
			teamPick: undefined,
			expected: false,
		},
	] as const)("$why: $expected", ({ scene, teamPick, expected }) => {
		expect(needsFeaturedMatch(scene, teamPick)).toBe(expected);
	});
});
