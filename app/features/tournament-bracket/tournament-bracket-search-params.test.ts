import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { tournamentBracketsSearchParams } from "./tournament-bracket-search-params";

describe("tournamentBracketsSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(tournamentBracketsSearchParams, {
			idx: [0, 3],
			group: [1, 173],
			division: [0, 24],
		});
	});

	test("decodes garbage to defaults", () => {
		assertDecodesToDefault(tournamentBracketsSearchParams, "idx", [
			["-1"],
			["abc"],
			["1.5"],
		]);
		assertDecodesToDefault(tournamentBracketsSearchParams, "group", [["abc"]]);
		assertDecodesToDefault(tournamentBracketsSearchParams, "division", [
			["-1"],
			["abc"],
		]);
	});
});
