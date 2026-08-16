import { describe, expect, test, vi } from "vitest";
import * as Seasons from "~/features/mmr/core/Seasons";
import {
	BEST_TIER_NUMBER,
	WORST_TIER_NUMBER,
} from "~/features/tournament/core/tiering";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import {
	RESULT_PLACEMENT_FILTERS,
	RESULT_SOURCES,
	RESULTS_FIRST_YEAR,
} from "./user-page-constants";
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
const currentYear = new Date().getFullYear();

describe("userResultsSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(userResultsSearchParams, {
			highlightsOnly: [false, true],
			page: [1, 2, 1000],
			tournament: ["In The Zone", "x", "a".repeat(100)],
			team: [null, "Team Olive", "a".repeat(100)],
			mate: [null, 1, 9999],
			minTier: [BEST_TIER_NUMBER, 5, WORST_TIER_NUMBER],
			maxTier: [BEST_TIER_NUMBER, 5, WORST_TIER_NUMBER],
			maxPlacement: [null, ...RESULT_PLACEMENT_FILTERS],
			fromYear: [null, RESULTS_FIRST_YEAR, currentYear],
			toYear: [null, RESULTS_FIRST_YEAR, currentYear],
			source: [...RESULT_SOURCES],
			minParticipantCount: [0, 16, 9999],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(userResultsSearchParams, "highlightsOnly", [
			["1"],
			["yes"],
		]);
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
		assertDecodesToDefault(userResultsSearchParams, "team", [
			[""],
			["a".repeat(101)],
		]);
		assertDecodesToDefault(userResultsSearchParams, "mate", [["0"], ["abc"]]);
		assertDecodesToDefault(userResultsSearchParams, "minTier", [
			["0"],
			["10"],
			["abc"],
		]);
		assertDecodesToDefault(userResultsSearchParams, "maxPlacement", [
			["2"],
			["abc"],
		]);
		assertDecodesToDefault(userResultsSearchParams, "fromYear", [
			[String(RESULTS_FIRST_YEAR - 1)],
			[String(currentYear + 1)],
		]);
		assertDecodesToDefault(userResultsSearchParams, "source", [["SOMETHING"]]);
		assertDecodesToDefault(userResultsSearchParams, "minParticipantCount", [
			["-1"],
			["10000"],
		]);
	});
});

describe("userSeasonsSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(userSeasonsSearchParams, {
			page: [1, 2, 99],
			info: ["weapons", "stages", "mates", "enemies"],
			season: [null, newestSeason, oldestSeason],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(userSeasonsSearchParams, "page", [["0"], ["abc"]]);
		assertDecodesToDefault(userSeasonsSearchParams, "info", [["INVALID"]]);
		assertDecodesToDefault(userSeasonsSearchParams, "season", [
			[String(notStartedSeason)],
			["-1"],
			["abc"],
		]);
	});

	test("decodes a season correctly even if the same URL was visited before the season started", () => {
		vi.useFakeTimers();
		try {
			// crawler or a user replays ?season=1 a few days before season 1 opens
			vi.setSystemTime(new Date("2023-09-01T00:00:00.000Z"));
			expect(
				userSeasonsSearchParams.parse(new URLSearchParams("season=1")).season,
			).toBe(null);

			// season 1 has now started; the same URL should decode to season 1
			vi.setSystemTime(new Date("2023-09-20T00:00:00.000Z"));
			expect(
				userSeasonsSearchParams.parse(new URLSearchParams("season=1")).season,
			).toBe(1);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("userSeasonSummaryGraphicSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(userSeasonSummaryGraphicSearchParams, {
			season: [null, newestSeason, oldestSeason],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(userSeasonSummaryGraphicSearchParams, "season", [
			[String(notStartedSeason)],
			["abc"],
		]);
	});
});

describe("userBuildsSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(userBuildsSearchParams, {
			weapon: ["ALL", "PUBLIC", "PRIVATE", 0, 40, 8010],
			sorting: [false, true],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(userBuildsSearchParams, "weapon", [
			["999999"],
			["foo"],
			[""],
		]);
		assertDecodesToDefault(userBuildsSearchParams, "sorting", [["1"], ["yes"]]);
	});
});

describe("userArtSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(userArtSearchParams, {
			source: ["ALL", "MADE-BY", "MADE-OF"],
			tag: ["chibi", "tag with spaces"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(userArtSearchParams, "source", [["INVALID"]]);
	});
});
