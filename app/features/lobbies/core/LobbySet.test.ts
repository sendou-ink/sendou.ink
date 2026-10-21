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

describe("LobbySet permissions", () => {
	const decided = setOf({ winners: ["ALPHA", "ALPHA"] });

	test.each([
		{
			why: "player reports",
			fn: LobbySet.canReport,
			set: setOf(),
			userId: 1,
			expected: true,
		},
		{
			why: "sitting out can't report",
			fn: LobbySet.canReport,
			set: setOf({ sittingOut: [9] }),
			userId: 9,
			expected: false,
		},
		{
			why: "no reports after decided",
			fn: LobbySet.canReport,
			set: decided,
			userId: 1,
			expected: false,
		},
		{
			why: "nothing to undo",
			fn: LobbySet.canUndo,
			set: setOf(),
			userId: 1,
			expected: false,
		},
		{
			why: "anyone playing undoes while reporting",
			fn: LobbySet.canUndo,
			set: setOf({ winners: ["ALPHA"] }),
			userId: 5,
			expected: true,
		},
		{
			why: "reporter side undoes the deciding report",
			fn: LobbySet.canUndo,
			set: decided,
			userId: 2,
			expected: true,
		},
		{
			why: "confirming side doesn't undo",
			fn: LobbySet.canUndo,
			set: decided,
			userId: 5,
			expected: false,
		},
		{
			why: "other side confirms",
			fn: LobbySet.canConfirm,
			set: decided,
			userId: 6,
			expected: true,
		},
		{
			why: "reporter side doesn't confirm",
			fn: LobbySet.canConfirm,
			set: decided,
			userId: 3,
			expected: false,
		},
		{
			why: "other side disputes",
			fn: LobbySet.canDispute,
			set: decided,
			userId: 7,
			expected: true,
		},
		{
			why: "no second dispute",
			fn: LobbySet.canDispute,
			set: setOf({ winners: ["ALPHA", "ALPHA"], disputed: true }),
			userId: 7,
			expected: false,
		},
		{
			why: "disputed can still be confirmed",
			fn: LobbySet.canConfirm,
			set: setOf({ winners: ["ALPHA", "ALPHA"], disputed: true }),
			userId: 7,
			expected: true,
		},
	])("$why", ({ fn, set, userId, expected }) => {
		expect(fn(set, userId)).toBe(expected);
	});
});
