import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { tournamentOrganizationSearchParams } from "./tournament-organization-search-params";

describe("tournamentOrganizationSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(tournamentOrganizationSearchParams, {
			month: [0, 11],
			year: [2020, 2100],
			series: [1, 42],
			page: [1, 2, 100],
			source: ["In The Zone", "swl"],
		});
	});

	it("decodes garbage to defaults", () => {
		assertDecodesToDefault(tournamentOrganizationSearchParams, "month", [
			["12"],
			["-1"],
			["abc"],
		]);
		assertDecodesToDefault(tournamentOrganizationSearchParams, "year", [
			["2019"],
			["2101"],
		]);
		assertDecodesToDefault(tournamentOrganizationSearchParams, "page", [
			["0"],
			["101"],
		]);
	});
});
