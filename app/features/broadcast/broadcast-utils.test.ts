import { describe, expect, test } from "vitest";
import type { BroadcastMatch, MatchProgress } from "./broadcast-types";
import { controlShares, gameInk, inkColorVars } from "./broadcast-utils";

const ink = { key: "lockYellowPurple", isFlipped: false } as const;

describe("gameInk", () => {
	const gameOneInk = { ...ink, matchId: 1, resultCount: 0 };

	test("gives the ink colors picked for the game the view shows", () => {
		expect(gameInk({ ink: gameOneInk, match: match(1, 0, 1) }, "live")).toBe(
			gameOneInk,
		);
	});

	test.each([
		{
			why: "its result is on air",
			state: { ink: gameOneInk, match: match(1, 1, 1) },
		},
		{
			why: "another match is featured",
			state: { ink: gameOneInk, match: match(2, 0, 0) },
		},
		{ why: "no match is featured", state: { ink: gameOneInk, match: null } },
		{ why: "none were picked", state: { ink: null, match: match(1, 0, 0) } },
	])("gives nothing when $why", ({ state }) => {
		expect(gameInk(state, "live")).toBeNull();
	});

	test("gives nothing for the next game a Take would put on air", () => {
		expect(
			gameInk({ ink: gameOneInk, match: match(1, 0, 1) }, "next"),
		).toBeNull();
	});
});

describe("inkColorVars", () => {
	test("colors the left team with the first color and picks readable text", () => {
		expect(inkColorVars({ ink, swapSides: false })).toEqual({
			"--bc-team-a": "#F0EB24",
			"--bc-team-a-text": "#15131f",
			"--bc-team-b": "#6236DF",
			"--bc-team-b-text": "#fff",
		});
	});

	test.each([
		{
			why: "flipped",
			args: { ink: { ...ink, isFlipped: true }, swapSides: false },
		},
		{ why: "sides swapped", args: { ink, swapSides: true } },
	])("gives the left team the second color when $why", ({ args }) => {
		expect(inkColorVars(args)["--bc-team-a"]).toBe("#6236DF");
	});

	test("keeps the theme's colors without ink colors", () => {
		expect(inkColorVars({ ink: null, swapSides: false })).toEqual({});
	});
});

function match(
	id: number,
	liveResultCount: number,
	nextResultCount: number,
): BroadcastMatch {
	const progress = (resultCount: number) => ({ resultCount }) as MatchProgress;

	return {
		id,
		progress: {
			live: progress(liveResultCount),
			next: progress(nextResultCount),
		},
	} as BroadcastMatch;
}

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
