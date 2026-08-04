import { describe, it } from "vitest";
import * as Seasons from "~/features/mmr/core/Seasons";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import {
	userArtSearchParams,
	userBuildsSearchParams,
	userResultsSearchParams,
	userSeasonSummaryGraphicSearchParams,
	userSeasonsSearchParams,
} from "./user-page-search-params";

const startedSeasons = Seasons.allStarted(new Date());
const newestSeason = startedSeasons[0];
const oldestSeason = startedSeasons.at(-1)!;
const notStartedSeason = newestSeason + 1000;

describe("userResultsSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(userResultsSearchParams, {
			all: [false, true],
			page: [1, 2, 1000],
			tournament: ["In The Zone", "x", "a".repeat(100)],
		});
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(userResultsSearchParams, "all", [["1"], ["yes"]]);
		assertDecodesToDefault(userResultsSearchParams, "page", [
			["0"],
			["1001"],
			["abc"],
		]);
		assertDecodesToDefault(userResultsSearchParams, "tournament", [
			[""],
			["   "],
			["a".repeat(101)],
		]);
	});
});

describe("userSeasonsSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(userSeasonsSearchParams, {
			page: [1, 2, 99],
			info: ["weapons", "stages", "mates", "enemies"],
			season: [null, newestSeason, oldestSeason],
		});
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(userSeasonsSearchParams, "page", [["0"], ["abc"]]);
		assertDecodesToDefault(userSeasonsSearchParams, "info", [["INVALID"]]);
		assertDecodesToDefault(userSeasonsSearchParams, "season", [
			[String(notStartedSeason)],
			["-1"],
			["abc"],
		]);
	});
});

describe("userSeasonSummaryGraphicSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(userSeasonSummaryGraphicSearchParams, {
			season: [null, newestSeason, oldestSeason],
		});
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(userSeasonSummaryGraphicSearchParams, "season", [
			[String(notStartedSeason)],
			["abc"],
		]);
	});
});

describe("userBuildsSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(userBuildsSearchParams, {
			weapon: ["ALL", "PUBLIC", "PRIVATE", 0, 40, 8010],
			sorting: [false, true],
		});
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(userBuildsSearchParams, "weapon", [
			["999999"],
			["foo"],
			[""],
		]);
		assertDecodesToDefault(userBuildsSearchParams, "sorting", [["1"], ["yes"]]);
	});
});

describe("userArtSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(userArtSearchParams, {
			source: ["ALL", "MADE-BY", "MADE-OF"],
			tag: ["chibi", "tag with spaces"],
		});
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(userArtSearchParams, "source", [["INVALID"]]);
	});
});
