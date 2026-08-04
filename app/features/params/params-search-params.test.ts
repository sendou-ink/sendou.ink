import { describe, expect, it } from "vitest";
import * as SearchParams from "~/modules/search-params/search-params";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { weaponParamsSearchParams } from "./params-search-params";

describe("weaponParamsSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(weaponParamsSearchParams, {
			tab: ["params", "patches"],
			hidden: [[], [10], [0, 50, 1000]],
			kit: [null, 0, 40, 8010],
			kitExtras: [true, false],
		});
	});

	it("accepts legacy comma-joined hidden ids", () => {
		expect(
			SearchParams.decodeParam(weaponParamsSearchParams.shape.hidden, [
				"10,20,30",
			]),
		).toEqual([10, 20, 30]);
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(weaponParamsSearchParams, "tab", [["bogus"]]);
		assertDecodesToDefault(weaponParamsSearchParams, "hidden", [
			["abc"],
			["1.5"],
		]);
		assertDecodesToDefault(weaponParamsSearchParams, "kit", [
			["9999"],
			["foo"],
		]);
		assertDecodesToDefault(weaponParamsSearchParams, "kitExtras", [["1"]]);
	});
});
