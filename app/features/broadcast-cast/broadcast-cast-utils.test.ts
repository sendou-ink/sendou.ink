import { describe, expect, test } from "vitest";
import {
	controlShares,
	needsFeaturedMatch,
	smoothLinePath,
} from "./broadcast-cast-utils";

describe("controlShares", () => {
	const read = (t: number, control: 0 | 1 | null) => ({
		t,
		score: [null, null] as [null, null],
		control,
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

describe("smoothLinePath", () => {
	test.each([
		{ why: "no points", points: [], expected: "" },
		{ why: "a single point", points: [{ x: 1, y: 2 }], expected: "M1,2" },
	])("draws $why as is", ({ points, expected }) => {
		expect(smoothLinePath(points, 3)).toBe(expected);
	});

	test("leaves out the reads close to the line through their neighbors", () => {
		const path = smoothLinePath(
			[
				{ x: 0, y: 0 },
				{ x: 10, y: 11 },
				{ x: 20, y: 19 },
				{ x: 30, y: 30 },
			],
			3,
		);

		expect(segments(path)).toHaveLength(1);
	});

	test("keeps a turn farther than the tolerance", () => {
		const path = smoothLinePath(
			[
				{ x: 0, y: 0 },
				{ x: 50, y: 0 },
				{ x: 60, y: 40 },
				{ x: 100, y: 40 },
			],
			3,
		);

		expect(segments(path)).toHaveLength(3);
	});

	test("never curves past the reads of a falling count", () => {
		const points = [
			{ x: 0, y: 0 },
			{ x: 40, y: 0 },
			{ x: 50, y: 30 },
			{ x: 55, y: 32 },
			{ x: 120, y: 33 },
			{ x: 130, y: 80 },
		];

		for (const { from, controls, to } of segments(smoothLinePath(points, 0))) {
			for (const control of controls) {
				expect(control.y).toBeGreaterThanOrEqual(from.y);
				expect(control.y).toBeLessThanOrEqual(to.y);
			}
		}
	});
});

/** The path's cubic segments with the point each starts from. */
function segments(path: string) {
	const numbers = (text: string) =>
		text.split(/[ ,]/).filter(Boolean).map(Number);
	const [start, ...curves] = path.split(" C");
	let [x, y] = numbers(start!.slice(1));

	return curves.map((curve) => {
		const [x1, y1, x2, y2, x3, y3] = numbers(curve);
		const segment = {
			from: { x: x!, y: y! },
			controls: [
				{ x: x1!, y: y1! },
				{ x: x2!, y: y2! },
			],
			to: { x: x3!, y: y3! },
		};
		[x, y] = [x3, y3];

		return segment;
	});
}
