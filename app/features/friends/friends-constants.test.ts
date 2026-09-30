import { describe, expect, test } from "vitest";
import { friendSectionSortValue } from "./friends-constants";

describe("friendSectionSortValue", () => {
	test.each([
		{
			why: "pinned with activity",
			isPinned: true,
			activityType: "SENDOUQ",
			expected: 0,
		},
		{
			why: "unpinned with activity",
			isPinned: false,
			activityType: "TOURNAMENT_MATCH",
			expected: 1,
		},
		{
			why: "pinned without activity",
			isPinned: true,
			activityType: null,
			expected: 2,
		},
		{
			why: "unpinned without activity",
			isPinned: false,
			activityType: null,
			expected: 3,
		},
	] as const)(
		"$why sorts as $expected",
		({ isPinned, activityType, expected }) => {
			expect(friendSectionSortValue({ isPinned, activityType })).toBe(expected);
		},
	);
});
