import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import {
	plansSearchParams,
	tldrawPlansSearchParams,
} from "./plans-search-params";

describe("plansSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(plansSearchParams, {
			plan: [null, "zVLLbsIwEPwVa88EEUiLlFu_oP0A5ITYwqmDE"],
			stage: [null, 0, 7, 24],
			mode: [null, "TW", "SZ", "CB"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(plansSearchParams, "plan", [["a".repeat(8_001)]]);
		assertDecodesToDefault(plansSearchParams, "stage", [["-1"], ["25"], ["a"]]);
		assertDecodesToDefault(plansSearchParams, "mode", [["SR"]]);
	});
});

describe("tldrawPlansSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(tldrawPlansSearchParams, {
			stage: [0, 7, 24],
			mode: ["TW", "SZ", "CB"],
			style: ["MINI", "OVER"],
			water: ["up", "down"],
			outlined: [false, true],
			ranges: [false, true],
			hideTop: [false, true],
			hideWeapons: [false, true],
			import: [null, "1759900000000-abc123"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(tldrawPlansSearchParams, "stage", [
			["-1"],
			["25"],
			["a"],
		]);
		assertDecodesToDefault(tldrawPlansSearchParams, "mode", [["SR"]]);
		assertDecodesToDefault(tldrawPlansSearchParams, "style", [["ITEMS"]]);
		assertDecodesToDefault(tldrawPlansSearchParams, "water", [["DOWN"]]);
		assertDecodesToDefault(tldrawPlansSearchParams, "outlined", [
			["1"],
			["yes"],
		]);
	});
});
