import { describe, expect, test } from "vitest";
import type { UserMapModePreferences } from "~/db/tables-json";
import * as MapVotes from "./MapVotes";

const preferences: UserMapModePreferences = {
	modes: [
		{ mode: "SZ", preference: "PREFER" },
		{ mode: "RM", preference: "AVOID" },
	],
	pool: [
		{ mode: "SZ", stages: [1, 2] },
		{ mode: "TC", stages: [3] },
		{ mode: "RM", stages: [1] },
	],
};

describe("MapVotes.votesFor", () => {
	test.each([
		{ why: "in the pool", mode: "SZ", stageId: 1, expected: true },
		{
			why: "in the pool of a neutral mode",
			mode: "TC",
			stageId: 3,
			expected: true,
		},
		{
			why: "stage not in the mode's pool",
			mode: "SZ",
			stageId: 3,
			expected: false,
		},
		{ why: "mode without a pool", mode: "CB", stageId: 1, expected: false },
		{ why: "pool of an avoided mode", mode: "RM", stageId: 1, expected: false },
	] as const)("$why", ({ mode, stageId, expected }) => {
		expect(MapVotes.votesFor(preferences, { mode, stageId })).toBe(expected);
	});
});
