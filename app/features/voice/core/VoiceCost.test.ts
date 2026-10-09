import { describe, expect, test } from "vitest";
import * as VoiceCost from "./VoiceCost";

describe("VoiceCost.monthlyCostUsd", () => {
	test.each([
		{ why: "no usage", minutes: 0, expected: 0 },
		{ why: "within the free minutes", minutes: 10_000, expected: 0 },
		{ why: "past the free minutes", minutes: 20_000, expected: 9.9 },
	])("$why", ({ minutes, expected }) => {
		expect(VoiceCost.monthlyCostUsd(minutes)).toBeCloseTo(expected);
	});
});

describe("VoiceCost.isOverBudget", () => {
	test.each([
		{ why: "a cheap month", minutes: 100_000, expected: false },
		{ why: "a month at the budget", minutes: 515_051, expected: true },
	])("$why", ({ minutes, expected }) => {
		expect(VoiceCost.isOverBudget(minutes)).toBe(expected);
	});
});

describe("VoiceCost.projectedMonthlyCostUsd", () => {
	test.each([
		{ why: "the month just started", minutes: 1_000, progress: 0, expected: 0 },
		{
			why: "half the month used the free minutes",
			minutes: 10_000,
			progress: 0.5,
			expected: 9.9,
		},
	])("$why", ({ minutes, progress, expected }) => {
		expect(
			VoiceCost.projectedMonthlyCostUsd({
				participantMinutes: minutes,
				monthProgress: progress,
			}),
		).toBeCloseTo(expected);
	});
});
