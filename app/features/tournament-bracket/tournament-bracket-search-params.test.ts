import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { tournamentBracketsSearchParams } from "./tournament-bracket-search-params";

describe("tournamentBracketsSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(tournamentBracketsSearchParams, {
			idx: [0, 3],
			group: [1, 173],
		});
	});

	it("decodes garbage to defaults", () => {
		assertDecodesToDefault(tournamentBracketsSearchParams, "idx", [
			["-1"],
			["abc"],
			["1.5"],
		]);
		assertDecodesToDefault(tournamentBracketsSearchParams, "group", [["abc"]]);
	});
});
