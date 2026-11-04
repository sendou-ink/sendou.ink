import { describe, expect, test } from "vitest";
import {
	criteriaWindows,
	DEFAULT_VOD_CLIP_CRITERIA,
	withDefaultCaps,
} from "../../core/clips/criteria";

describe("criteriaWindows", () => {
	const game = (...killTimes: number[]) => ({
		kills: killTimes.map((t) => ({ t, time: null, name: null })),
		deaths: [],
	});
	const criteria = {
		minKills: 3,
		maxSecondsByKills: { 2: 20, 3: 30, 4: 45, 5: 60 },
	};
	const spans = (windows: ReturnType<typeof criteriaWindows>) =>
		windows.map((window) => [window.start, window.end, window.kills]);

	test.each([
		{
			why: "a 3-splat streak within its cap",
			kills: [100, 110, 120],
			expected: [[95, 123, 3]],
		},
		{
			why: "a 3-splat streak over its cap",
			kills: [100, 112, 124],
			expected: [],
		},
		{
			why: "a 4-splat streak may run longer than a 3-splat one",
			kills: [100, 112, 124, 136],
			expected: [[95, 139, 4]],
		},
		{
			why: "a streak longer than the last count uses its cap",
			kills: [100, 108, 116, 124, 132, 140],
			expected: [[95, 143, 6]],
		},
		{
			why: "streaks under the minimum are left out",
			kills: [100, 105],
			expected: [],
		},
	])("$why", ({ kills, expected }) => {
		expect(spans(criteriaWindows(game(...kills), criteria))).toEqual(expected);
	});

	test("the best reading of a streak wins and splats aren't shared", () => {
		// all five fit 60 s; their first three alone would also fit 30 s
		const windows = criteriaWindows(game(100, 105, 110, 125, 140), criteria);

		expect(spans(windows)).toEqual([[95, 143, 5]]);
	});

	test("the VoD default clips 4 splats in a row and leaves out 3", () => {
		const windows = criteriaWindows(
			game(100, 110, 120, 130, 200, 205, 210),
			DEFAULT_VOD_CLIP_CRITERIA,
		);

		expect(spans(windows)).toEqual([[95, 133, 4]]);
	});
});

describe("withDefaultCaps", () => {
	test("counts missing from the saved criteria take the default cap", () => {
		expect(
			withDefaultCaps(
				{ minKills: 2, maxSecondsByKills: { 3: 20 } },
				{ minKills: 4, maxSecondsByKills: { 2: 60, 3: 60 } },
			),
		).toEqual({ minKills: 2, maxSecondsByKills: { 2: 60, 3: 20 } });
	});
});
