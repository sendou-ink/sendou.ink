import { describe, expect, test } from "vitest";
import {
	type ScannerMatchObjectiveSample,
	type ScannerMatchPlayerStatusSample,
	swapObjectiveSampleSides,
	swapPlayerStatusSampleSides,
} from "../../core/scanner-match";

const objectiveSample = (
	partial: Partial<ScannerMatchObjectiveSample> = {},
): ScannerMatchObjectiveSample => ({
	t: 120,
	time: 215,
	score: [80, 60],
	penalty: [null, 10],
	control: 0,
	...partial,
});

describe("swapObjectiveSampleSides", () => {
	test("exchanges the per-team pairs and flips control", () => {
		expect(swapObjectiveSampleSides(objectiveSample())).toEqual({
			t: 120,
			time: 215,
			score: [60, 80],
			penalty: [10, null],
			control: 1,
		});
	});

	test.each([
		{ why: "a read position is mirrored", position: -30, expected: 30 },
		{ why: "an unread position stays unread", position: null, expected: null },
	])("$why", ({ position, expected }) => {
		expect(
			swapObjectiveSampleSides(objectiveSample({ position })).position,
		).toBe(expected);
	});

	test("keeps a sample without a track position without one", () => {
		expect(swapObjectiveSampleSides(objectiveSample())).not.toHaveProperty(
			"position",
		);
	});

	test("keeps a neutral objective neutral", () => {
		expect(
			swapObjectiveSampleSides(objectiveSample({ control: null })).control,
		).toBeNull();
	});
});

describe("swapPlayerStatusSampleSides", () => {
	test("exchanges the per-team special and death flags", () => {
		const sample: ScannerMatchPlayerStatusSample = {
			t: 60,
			time: 240,
			special: [
				[true, false, false, false],
				[false, false, false, false],
			],
			dead: [
				[false, false, false, false],
				[false, true, false, false],
			],
		};

		expect(swapPlayerStatusSampleSides(sample)).toEqual({
			t: 60,
			time: 240,
			special: [sample.special[1], sample.special[0]],
			dead: [sample.dead[1], sample.dead[0]],
		});
	});
});
