import { describe, expect, test } from "vitest";
import type { UserMapModePreferences } from "~/db/tables-json";
import * as FeedRotations from "./FeedRotations";

const HOUR = 3600;
const WEEK = 168 * HOUR;
const MONDAY_20 = 1_800_000_000 - (1_800_000_000 % WEEK) + 20 * HOUR;

describe("FeedRotations.usualPlayHours", () => {
	test("counts an hour played on two different weeks", () => {
		const hours = FeedRotations.usualPlayHours([MONDAY_20, MONDAY_20 + WEEK]);

		expect(hours.size).toBe(1);
	});

	test("ignores an hour played only during one week", () => {
		const hours = FeedRotations.usualPlayHours([
			MONDAY_20,
			MONDAY_20 + 10 * 60,
			MONDAY_20 + 20 * 60,
		]);

		expect(hours.size).toBe(0);
	});
});

describe("FeedRotations.isDuringUsualHours", () => {
	const usualHours = FeedRotations.usualPlayHours([
		MONDAY_20,
		MONDAY_20 + WEEK,
	]);

	test.each([
		{
			why: "same hour next week",
			startsAt: MONDAY_20 + 2 * WEEK,
			expected: true,
		},
		{
			why: "starts an hour later",
			startsAt: MONDAY_20 + 2 * WEEK + HOUR,
			expected: true,
		},
		{
			why: "ends just before",
			startsAt: MONDAY_20 + 2 * WEEK - 3 * HOUR,
			expected: false,
		},
		{
			why: "different day",
			startsAt: MONDAY_20 + 2 * WEEK + 24 * HOUR,
			expected: false,
		},
	])("$why", ({ startsAt, expected }) => {
		expect(
			FeedRotations.isDuringUsualHours(
				{ startsAt, endsAt: startsAt + 2 * HOUR },
				usualHours,
			),
		).toBe(expected);
	});
});

describe("FeedRotations.matchingStageIds", () => {
	const preferences: UserMapModePreferences = {
		modes: [{ mode: "RM", preference: "AVOID" }],
		pool: [
			{ mode: "SZ", stages: [1, 2, 3] },
			{ mode: "RM", stages: [1, 2, 3] },
		],
	};

	test.each([
		{
			why: "both stages in pool",
			mode: "SZ",
			stageIds: [1, 2],
			expected: [1, 2],
		},
		{ why: "one stage in pool", mode: "SZ", stageIds: [3, 9], expected: [3] },
		{ why: "no pool for the mode", mode: "TC", stageIds: [1, 2], expected: [] },
		{ why: "mode avoided", mode: "RM", stageIds: [1, 2], expected: [] },
	] as const)("$why", ({ mode, stageIds, expected }) => {
		expect(
			FeedRotations.matchingStageIds({ mode, stageIds }, preferences),
		).toEqual(expected);
	});
});
