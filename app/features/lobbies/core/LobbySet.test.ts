import { describe, expect, test } from "vitest";
import * as LobbySet from "./LobbySet";
import { setOf } from "./tests/fixtures";

describe("LobbySet.status", () => {
	test.each([
		{ why: "nothing reported", set: setOf(), expected: "REPORTING" },
		{
			why: "undecided",
			set: setOf({ winners: ["ALPHA"] }),
			expected: "REPORTING",
		},
		{
			why: "decided",
			set: setOf({ winners: ["ALPHA", "ALPHA"] }),
			expected: "AWAITING_CONFIRMATION",
		},
		{
			why: "decided and disputed",
			set: setOf({ winners: ["ALPHA", "ALPHA"], disputed: true }),
			expected: "DISPUTED",
		},
		{
			why: "confirmed",
			set: setOf({ winners: ["ALPHA", "ALPHA"], confirmed: true }),
			expected: "CONFIRMED",
		},
		{
			why: "forfeited mid-set",
			set: setOf({ winners: ["ALPHA"], forfeitingSide: "ALPHA" }),
			expected: "FORFEITED",
		},
	] as const)("$why → $expected", ({ set, expected }) => {
		expect(LobbySet.status(set)).toBe(expected);
	});
});

describe("LobbySet.winnerSide", () => {
	test.each([
		{ why: "undecided", set: setOf({ winners: ["ALPHA"] }), expected: null },
		{
			why: "2-1 in a best of 3",
			set: setOf({ winners: ["ALPHA", "BRAVO", "BRAVO"] }),
			expected: "BRAVO",
		},
		{
			why: "a forfeit wins it for the other side even when ahead",
			set: setOf({ winners: ["ALPHA"], forfeitingSide: "ALPHA" }),
			expected: "BRAVO",
		},
		{
			why: "best of 1",
			set: setOf({ winners: ["ALPHA"], bestOf: 1 }),
			expected: "ALPHA",
		},
	] as const)("$why", ({ set, expected }) => {
		expect(LobbySet.winnerSide(set)).toBe(expected);
	});
});

describe("LobbySet.currentGameIndex", () => {
	test.each([
		{ why: "first map", set: setOf(), expected: 0 },
		{ why: "after one", set: setOf({ winners: ["BRAVO"] }), expected: 1 },
		{
			why: "decided",
			set: setOf({ winners: ["BRAVO", "BRAVO"] }),
			expected: null,
		},
	])("$why", ({ set, expected }) => {
		expect(LobbySet.currentGameIndex(set)).toBe(expected);
	});
});

const decided = setOf({ winners: ["ALPHA", "ALPHA"] });

describe("LobbySet.canReport", () => {
	test.each([
		{ why: "player reports", set: setOf(), userId: 1, expected: true },
		{
			why: "sitting out can't report",
			set: setOf({ sittingOut: [9] }),
			userId: 9,
			expected: false,
		},
		{
			why: "no reports after decided",
			set: decided,
			userId: 1,
			expected: false,
		},
	])("$why", ({ set, userId, expected }) => {
		expect(LobbySet.canReport(set, userId)).toBe(expected);
	});
});

describe("LobbySet.canUndo", () => {
	test.each([
		{ why: "nothing to undo", set: setOf(), userId: 1, expected: false },
		{
			why: "anyone playing undoes while reporting",
			set: setOf({ winners: ["ALPHA"] }),
			userId: 5,
			expected: true,
		},
		{
			why: "reporter side undoes the deciding report",
			set: decided,
			userId: 2,
			expected: true,
		},
		{
			why: "confirming side doesn't undo",
			set: decided,
			userId: 5,
			expected: false,
		},
	])("$why", ({ set, userId, expected }) => {
		expect(LobbySet.canUndo(set, userId)).toBe(expected);
	});
});

describe("LobbySet.canConfirm", () => {
	test.each([
		{ why: "other side confirms", set: decided, userId: 6, expected: true },
		{
			why: "reporter side doesn't confirm",
			set: decided,
			userId: 3,
			expected: false,
		},
		{
			why: "disputed can still be confirmed",
			set: setOf({ winners: ["ALPHA", "ALPHA"], disputed: true }),
			userId: 7,
			expected: true,
		},
	])("$why", ({ set, userId, expected }) => {
		expect(LobbySet.canConfirm(set, userId)).toBe(expected);
	});
});

describe("LobbySet.canDispute", () => {
	test.each([
		{ why: "other side disputes", set: decided, userId: 7, expected: true },
		{
			why: "no second dispute",
			set: setOf({ winners: ["ALPHA", "ALPHA"], disputed: true }),
			userId: 7,
			expected: false,
		},
	])("$why", ({ set, userId, expected }) => {
		expect(LobbySet.canDispute(set, userId)).toBe(expected);
	});
});

describe("LobbySet.score", () => {
	test.each([
		{
			why: "best of 3",
			set: setOf({ winners: ["ALPHA", "BRAVO"] }),
			expected: { alpha: 1, bravo: 1, mapsToWin: 2 },
		},
		{
			why: "best of 5",
			set: setOf({ winners: ["BRAVO"], bestOf: 5 }),
			expected: { alpha: 0, bravo: 1, mapsToWin: 3 },
		},
	])("$why", ({ set, expected }) => {
		expect(LobbySet.score(set)).toEqual(expected);
	});
});

describe("LobbySet.isFinished", () => {
	test.each([
		{
			why: "decided but not confirmed",
			set: setOf({ winners: ["ALPHA", "ALPHA"] }),
			expected: false,
		},
		{
			why: "confirmed",
			set: setOf({ winners: ["ALPHA", "ALPHA"], confirmed: true }),
			expected: true,
		},
		{
			why: "forfeited",
			set: setOf({ forfeitingSide: "BRAVO" }),
			expected: true,
		},
	] as const)("$why", ({ set, expected }) => {
		expect(LobbySet.isFinished(set)).toBe(expected);
	});
});

describe("LobbySet.reportedCount", () => {
	test("counts the maps with a winner", () => {
		expect(LobbySet.reportedCount(setOf({ winners: ["ALPHA", "BRAVO"] }))).toBe(
			2,
		);
	});
});

describe("LobbySet.sideOf", () => {
	test.each([
		{ why: "alpha player", userId: 1, expected: "ALPHA" },
		{ why: "bravo player", userId: 5, expected: "BRAVO" },
		{ why: "sitting out", userId: 9, expected: null },
		{ why: "not in the set", userId: 10, expected: null },
	])("$why", ({ userId, expected }) => {
		expect(LobbySet.sideOf(setOf({ sittingOut: [9] }), userId)).toBe(expected);
	});
});

describe("LobbySet.playersOf", () => {
	test("leaves out who sat the set out", () => {
		expect(LobbySet.playersOf(setOf({ sittingOut: [9] }), "BRAVO")).toEqual([
			5, 6, 7, 8,
		]);
	});
});

describe("LobbySet.otherSide", () => {
	test.each([
		{ side: "ALPHA", expected: "BRAVO" },
		{ side: "BRAVO", expected: "ALPHA" },
	] as const)("%s", ({ side, expected }) => {
		expect(LobbySet.otherSide(side)).toBe(expected);
	});
});
