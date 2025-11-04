import { describe, expect, test } from "vitest";
import * as Test from "~/utils/Test";
import { mapModePreferencesToModeList } from "./match.server";

describe("mapModePreferencesToModeList()", () => {
	test("returns default list if no preferences", () => {
		const modeList = mapModePreferencesToModeList([], []);

		expect(
			Test.arrayContainsSameItems(["SZ", "TC", "RM", "CB"], modeList),
		).toBe(true);
	});

	test("returns default list if equally disliking everything", () => {
		const dislikingEverything = [
			{ mode: "TW", preference: "AVOID" } as const,
			{ mode: "SZ", preference: "AVOID" } as const,
			{ mode: "TC", preference: "AVOID" } as const,
			{ mode: "RM", preference: "AVOID" } as const,
			{ mode: "CB", preference: "AVOID" } as const,
		];

		const modeList = mapModePreferencesToModeList(
			[
				dislikingEverything,
				dislikingEverything,
				dislikingEverything,
				dislikingEverything,
			],
			[
				dislikingEverything,
				dislikingEverything,
				dislikingEverything,
				dislikingEverything,
			],
		);

		expect(
			Test.arrayContainsSameItems(["SZ", "TC", "RM", "CB"], modeList),
		).toBe(true);
	});

	test("if positive about nothing, choose the most liked (-TW)", () => {
		const modeList = mapModePreferencesToModeList(
			[[{ mode: "SZ", preference: "AVOID" }]],
			[],
		);

		expect(Test.arrayContainsSameItems(["TC", "RM", "CB"], modeList)).toBe(
			true,
		);
	});

	test("only turf war possible to get if least bad option", () => {
		const modeList = mapModePreferencesToModeList(
			[
				[
					{ mode: "SZ", preference: "AVOID" },
					{ mode: "TC", preference: "AVOID" },
					{ mode: "RM", preference: "AVOID" },
					{ mode: "CB", preference: "AVOID" },
					{ mode: "TW", preference: "AVOID" },
				],
				[{ mode: "TW", preference: "PREFER" }],
			],
			[],
		);

		expect(Test.arrayContainsSameItems(["TW"], modeList)).toBe(true);
	});

	test("team votes for their preference", () => {
		const modeList = mapModePreferencesToModeList(
			[
				[
					{ mode: "SZ", preference: "PREFER" },
					{ mode: "TC", preference: "PREFER" },
				],
				[{ mode: "TC", preference: "PREFER" }],
				[{ mode: "TC", preference: "AVOID" }],
				[{ mode: "TC", preference: "PREFER" }],
			],
			[
				[{ mode: "TC", preference: "PREFER" }],
				[{ mode: "TC", preference: "PREFER" }],
				[{ mode: "TC", preference: "AVOID" }],
				[{ mode: "TC", preference: "AVOID" }],
			],
		);

		expect(Test.arrayContainsSameItems(["SZ", "TC"], modeList)).toBe(true);
	});

	test("favorite ranked mode sorted first in the array", () => {
		expect(
			mapModePreferencesToModeList(
				[[{ mode: "TC", preference: "PREFER" }]],
				[],
			)[0],
		).toBe("TC");
	});

	test("includes turf war if more prefer than want to avoid", () => {
		const modeList = mapModePreferencesToModeList(
			[[{ mode: "TW", preference: "PREFER" }]],
			[[{ mode: "SZ", preference: "PREFER" }]],
		);

		expect(Test.arrayContainsSameItems(["TW", "SZ"], modeList)).toBe(true);
	});

	test("doesn't include turf war if mixed", () => {
		const modeList = mapModePreferencesToModeList(
			[[{ mode: "TW", preference: "PREFER" }]],
			[[{ mode: "TW", preference: "AVOID" }]],
		);

		expect(
			Test.arrayContainsSameItems(["SZ", "TC", "RM", "CB"], modeList),
		).toBe(true);
	});
});
