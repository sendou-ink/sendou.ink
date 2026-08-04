import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { leaderboardsSearchParams } from "./leaderboards-search-params";

describe("leaderboardsSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(leaderboardsSearchParams, {
			type: [
				"USER",
				"TEAM",
				"TEAM-ALL",
				"USER-SHOOTERS",
				"XP-ALL",
				"XP-MODE-SZ",
				"XP-WEAPON-0",
			],
			season: [null, 1, 10],
		});
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(leaderboardsSearchParams, "type", [
			["garbage"],
			["XP-WEAPON-99999"],
		]);
		assertDecodesToDefault(leaderboardsSearchParams, "season", [
			["abc"],
			["1.5"],
		]);
	});
});
