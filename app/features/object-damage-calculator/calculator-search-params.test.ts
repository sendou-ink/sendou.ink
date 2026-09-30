import { describe, expect, test } from "vitest";
import * as SearchParams from "~/modules/search-params/search-params";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { calculatorSearchParams } from "./calculator-search-params";

describe("calculatorSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(calculatorSearchParams, {
			weapon: [
				{ type: "MAIN", id: 0 },
				{ type: "MAIN", id: 1000 },
				{ type: "SUB", id: 0 },
				{ type: "SPECIAL", id: 1 },
			],
			ap: [0, 3, 57],
			dmg: [null, "DIRECT", "BOMB_NORMAL"],
			multi: [true, false],
		});
	});

	test("decodes the legacy bare numeric weapon format", () => {
		expect(
			SearchParams.decodeParam(calculatorSearchParams.shape.weapon, ["1000"]),
		).toEqual({ type: "MAIN", id: 1000 });
	});

	test("decodes garbage to defaults", () => {
		assertDecodesToDefault(calculatorSearchParams, "weapon", [
			[""],
			["MAIN_999999"],
			["SUB_999999"],
			["nope"],
		]);
		assertDecodesToDefault(calculatorSearchParams, "ap", [
			["1"],
			["58"],
			["-3"],
			["abc"],
		]);
		assertDecodesToDefault(calculatorSearchParams, "dmg", [[""], ["NOPE"]]);
	});
});
