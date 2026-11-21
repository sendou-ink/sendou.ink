import { minutesToMilliseconds } from "date-fns";
import { describe, expect, test } from "vitest";
import * as StartsIn from "./StartsIn";

const NOW = Date.UTC(2026, 10, 14, 12);

describe("StartsIn.minutesFromNow", () => {
	test.each([
		{ why: "due now", earliest: 0, latest: 0, expected: { min: 0, max: 0 } },
		{
			why: "rounded to multiples of 5",
			earliest: 22,
			latest: 37,
			expected: { min: 20, max: 40 },
		},
		{
			why: "past times count as now",
			earliest: -10,
			latest: 3,
			expected: { min: 0, max: 5 },
		},
		{ why: "too far out", earliest: 60, latest: 200, expected: null },
	])("$why", ({ earliest, latest, expected }) => {
		expect(
			StartsIn.minutesFromNow(
				{
					earliest: NOW + minutesToMilliseconds(earliest),
					latest: NOW + minutesToMilliseconds(latest),
				},
				NOW,
			),
		).toEqual(expected);
	});
});
