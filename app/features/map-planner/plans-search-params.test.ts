import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { plansSearchParams } from "./plans-search-params";

describe("plansSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(plansSearchParams, {
			stage: [0, 7, 24],
			mode: ["TW", "SZ", "CB"],
			style: ["MINI", "OVER"],
			water: ["up", "down"],
			outlined: [false, true],
			ranges: [false, true],
			hideTop: [false, true],
			hideWeapons: [false, true],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(plansSearchParams, "stage", [["-1"], ["25"], ["a"]]);
		assertDecodesToDefault(plansSearchParams, "mode", [["SR"]]);
		assertDecodesToDefault(plansSearchParams, "style", [["ITEMS"]]);
		assertDecodesToDefault(plansSearchParams, "water", [["DOWN"]]);
		assertDecodesToDefault(plansSearchParams, "outlined", [["1"], ["yes"]]);
	});
});
