import { describe, expect, test } from "vitest";
import * as Countdown from "./countdown";

const NOW = new Date("2026-09-05T12:00:00Z");

describe("Countdown.remainingUntil", () => {
	test.each([
		{
			why: "one full day",
			target: "2026-09-06T12:00:00Z",
			expected: { days: 1, hours: 0, minutes: 0, seconds: 0 },
		},
		{
			why: "mixed units",
			target: "2026-09-07T14:30:15Z",
			expected: { days: 2, hours: 2, minutes: 30, seconds: 15 },
		},
		{
			why: "under a minute",
			target: "2026-09-05T12:00:45Z",
			expected: { days: 0, hours: 0, minutes: 0, seconds: 45 },
		},
		{
			why: "more than a year stays in days",
			target: "2027-09-05T12:00:00Z",
			expected: { days: 365, hours: 0, minutes: 0, seconds: 0 },
		},
	])("splits the remaining time ($why)", ({ target, expected }) => {
		expect(Countdown.remainingUntil(NOW, new Date(target))).toEqual(expected);
	});

	test.each([
		{ why: "same instant", target: "2026-09-05T12:00:00Z" },
		{ why: "in the past", target: "2026-09-01T00:00:00Z" },
	])("returns null once the target has passed ($why)", ({ target }) => {
		expect(Countdown.remainingUntil(NOW, new Date(target))).toBeNull();
	});
});
