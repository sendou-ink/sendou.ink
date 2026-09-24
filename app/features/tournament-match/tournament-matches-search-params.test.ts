import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { tournamentMatchesSearchParams } from "./tournament-matches-search-params";

describe("tournamentMatchesSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(tournamentMatchesSearchParams, {
			tab: ["scheduled", "unscheduled", "past"],
			division: [null, 0, 3, "all"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(tournamentMatchesSearchParams, "tab", [["garbage"]]);
		assertDecodesToDefault(tournamentMatchesSearchParams, "division", [
			["-1"],
			["abc"],
			[""],
		]);
	});
});
