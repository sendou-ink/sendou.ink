import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import {
	qLookingSearchParams,
	qSearchParams,
	weaponUsageSearchParams,
} from "./q-search-params";

describe("qSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(qSearchParams, {
			join: [null, "abc123", "1BFXar-zY"],
		});
	});
});

describe("qLookingSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(qLookingSearchParams, {
			preview: [false, true],
			joining: [false, true],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(qLookingSearchParams, "preview", [["1"], ["yes"]]);
		assertDecodesToDefault(qLookingSearchParams, "joining", [["1"], ["TRUE"]]);
	});
});

describe("weaponUsageSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(weaponUsageSearchParams, {
			userId: [null, 1, 123456],
			season: [null, 0, 1, 10],
			stageId: [null, 0, 11],
			modeShort: [null, "TW", "SZ", "CB"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(weaponUsageSearchParams, "userId", [
			["0"],
			["-1"],
			["abc"],
		]);
		assertDecodesToDefault(weaponUsageSearchParams, "season", [
			["-1"],
			["1.5"],
			["abc"],
		]);
		assertDecodesToDefault(weaponUsageSearchParams, "stageId", [
			["-1"],
			["9999"],
		]);
		assertDecodesToDefault(weaponUsageSearchParams, "modeShort", [
			["XX"],
			["tw"],
		]);
	});
});
