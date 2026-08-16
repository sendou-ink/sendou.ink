import { describe, test } from "vitest";
import { assertRoundTrips } from "#lib/modules/search-params/search-params-test-utils.ts";
import { leaderboardsSearchParams } from "./leaderboards-search-params.ts";

describe("leaderboardsSearchParams", () => {
	test("round-trips representative values", () => {
		assertRoundTrips(leaderboardsSearchParams, {
			type: ["USER", "TEAM", "TEAM-ALL", "USER-SHOOTERS", "XP-ALL", "XP-MODE-SZ", "XP-WEAPON-40"],
			season: [null, 0, 5],
		});
	});
});
