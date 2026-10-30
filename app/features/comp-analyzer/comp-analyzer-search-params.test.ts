import { describe, expect, test } from "vitest";
import * as SearchParams from "~/modules/search-params/search-params";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { compAnalyzerSearchParams } from "./comp-analyzer-search-params";

describe("compAnalyzerSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(compAnalyzerSearchParams, {
			categorization: ["category", "sub", "special"],
			weapons: [[], [0], [10, 20, 30, 40]],
			singleCombos: [false, true],
			subDef: [0, 29, 57],
			res: [0, 57],
			rangeVariants: [[], ["1010-horizontal"], ["400-tap", "400-hold"]],
			specialRanges: [false, true],
			hiddenRanges: [[], [1010], [1010, 400]],
		});
	});

	test("accepts legacy comma-joined weapon ids", () => {
		expect(
			SearchParams.decodeParam(compAnalyzerSearchParams.shape.weapons, [
				"10,20",
			]),
		).toEqual([10, 20]);
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(compAnalyzerSearchParams, "categorization", [
			["kit"],
		]);
		assertDecodesToDefault(compAnalyzerSearchParams, "weapons", [
			["0,10,20,30,40"],
		]);
		assertDecodesToDefault(compAnalyzerSearchParams, "singleCombos", [["1"]]);
		assertDecodesToDefault(compAnalyzerSearchParams, "subDef", [
			["-1"],
			["58"],
			["abc"],
		]);
		assertDecodesToDefault(compAnalyzerSearchParams, "res", [["-1"], ["58"]]);
		assertDecodesToDefault(compAnalyzerSearchParams, "specialRanges", [["1"]]);
	});

	test("drops malformed range variant entries", () => {
		expect(
			SearchParams.decodeParam(compAnalyzerSearchParams.shape.rangeVariants, [
				"1010-horizontal",
				"1010-sideways",
				"horizontal",
			]),
		).toEqual(["1010-horizontal"]);
	});
});
