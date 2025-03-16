import { describe, expect, test } from "vitest";
import { tierDifferenceToRangeOrExact } from "./groups.server";

const paramsToExpected = new Map<
	[
		Parameters<typeof tierDifferenceToRangeOrExact>[0]["ourTier"],
		Parameters<typeof tierDifferenceToRangeOrExact>[0]["theirTier"],
	],
	ReturnType<typeof tierDifferenceToRangeOrExact>["tier"]
>()
	// exact
	.set(
		[
			{ isPlus: false, name: "GOLD" },
			{ isPlus: false, name: "GOLD" },
		],
		{ isPlus: false, name: "GOLD" },
	)
	// 1 place difference
	.set(
		[
			{ isPlus: false, name: "GOLD" },
			{ isPlus: true, name: "GOLD" },
		],
		[
			{ isPlus: true, name: "SILVER" },
			{ isPlus: true, name: "GOLD" },
		],
	)
	// 2 places difference
	.set(
		[
			{ isPlus: false, name: "GOLD" },
			{ isPlus: false, name: "PLATINUM" },
		],
		[
			{ isPlus: false, name: "SILVER" },
			{ isPlus: false, name: "PLATINUM" },
		],
	)
	// too high, has to be exact
	.set(
		[
			{ isPlus: true, name: "LEVIATHAN" },
			{ isPlus: false, name: "LEVIATHAN" },
		],
		{ isPlus: false, name: "LEVIATHAN" },
	)
	// too low, has to be exact
	.set(
		[
			{ isPlus: false, name: "IRON" },
			{ isPlus: true, name: "IRON" },
		],
		{ isPlus: true, name: "IRON" },
	)
	// not max rank but still too high
	.set(
		[
			{ isPlus: false, name: "LEVIATHAN" },
			{ isPlus: false, name: "DIAMOND" },
		],
		{ isPlus: false, name: "DIAMOND" },
	);

describe("tierDifferenceToRangeOrExact()", () => {
	for (const [input, expected] of paramsToExpected) {
		test(`works for ${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
			const result = tierDifferenceToRangeOrExact({
				ourTier: input[0],
				theirTier: input[1],
				hasLeviathan: true,
			}).tier;
			expect(result).toEqual(expected);
		});
	}

	test("works before leviathan", () => {
		const result = tierDifferenceToRangeOrExact({
			ourTier: { isPlus: true, name: "DIAMOND" },
			theirTier: { isPlus: false, name: "DIAMOND" },
			hasLeviathan: false,
		}).tier;
		expect(result).toEqual({ isPlus: false, name: "DIAMOND" });
	});
});
