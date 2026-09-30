import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import {
	calendarEventsSearchParams,
	calendarNewSearchParams,
	calendarSearchParams,
} from "./calendar-search-params";
import * as CalendarEvent from "./core/CalendarEvent";

describe("calendarSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(calendarSearchParams, {
			modes: [CalendarEvent.defaultFilters().modes, ["SZ", "TC"], ["TB"]],
			modesExact: [false, true],
			games: [CalendarEvent.defaultFilters().games, ["S3"], ["S1", "S2"]],
			preferredVersus: [
				CalendarEvent.defaultFilters().preferredVersus,
				["4v4"],
				["1v1", "2v2"],
			],
			preferredStartTime: ["ANY", "EU", "NA", "AU"],
			tagsIncluded: [[], ["ART"], ["ART", "MONEY"]],
			tagsExcluded: [[], ["MONEY"]],
			isSendou: [false, true],
			isRanked: [false, true],
			minTeamCount: [0, 16],
			minTier: [1, 3, 9],
			maxTier: [1, 5, 9],
			orgsIncluded: [[], ["Splat Org"], ["A", "B"]],
			orgsExcluded: [[], ["Bad Org"]],
			authorIdsExcluded: [[], [1, 274]],
			useDefaults: [true, false],
			day: [null, 1, 15, 31],
			month: [null, 0, 11],
			year: [null, 2015, 2026, 2100],
		});
	});

	test("decodes garbage to defaults", () => {
		assertDecodesToDefault(calendarSearchParams, "preferredStartTime", [
			["XX"],
			["eu"],
		]);
		assertDecodesToDefault(calendarSearchParams, "modesExact", [
			["1"],
			["yes"],
		]);
		assertDecodesToDefault(calendarSearchParams, "minTeamCount", [
			["-1"],
			["abc"],
			["1.5"],
		]);
		assertDecodesToDefault(calendarSearchParams, "minTier", [
			["0"],
			["10"],
			["abc"],
		]);
		assertDecodesToDefault(calendarSearchParams, "maxTier", [["0"], ["10"]]);
		assertDecodesToDefault(calendarSearchParams, "games", [["BAD"]]);
		assertDecodesToDefault(calendarSearchParams, "day", [
			["0"],
			["32"],
			["abc"],
			["1.5"],
		]);
		assertDecodesToDefault(calendarSearchParams, "month", [["-1"], ["12"]]);
		assertDecodesToDefault(calendarSearchParams, "year", [
			["2014"],
			["2101"],
			["nope"],
		]);
	});
});

describe("calendarEventsSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(calendarEventsSearchParams, {
			view: [
				null,
				"registered",
				"hosting",
				"scrims",
				"team",
				"saved",
				"organization",
			],
		});
	});

	test("decodes garbage to defaults", () => {
		assertDecodesToDefault(calendarEventsSearchParams, "view", [
			["invalid"],
			["Registered"],
			[""],
		]);
	});
});

describe("calendarNewSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(calendarNewSearchParams, {
			eventId: [null, 1, 12345],
			copyEventId: [null, 99],
			tournament: [false, true],
		});
	});

	test("decodes garbage to defaults", () => {
		assertDecodesToDefault(calendarNewSearchParams, "eventId", [
			["0"],
			["-1"],
			["abc"],
			["1.5"],
		]);
		assertDecodesToDefault(calendarNewSearchParams, "tournament", [
			["1"],
			["yes"],
			[""],
		]);
	});
});
