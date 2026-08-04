import { describe, expect, it } from "vitest";
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
	it("round-trips", () => {
		assertRoundTrips(calendarSearchParams, {
			filters: [
				CalendarEvent.defaultFilters(),
				{
					preferredStartTime: "EU",
					tagsIncluded: ["ART"],
					tagsExcluded: ["MONEY"],
					isSendou: true,
					isRanked: true,
					orgsIncluded: ["Splat Org"],
					orgsExcluded: [],
					authorIdsExcluded: [1, 274],
					games: ["S3"],
					preferredVersus: ["4v4"],
					modes: ["SZ", "TC"],
					modesExact: true,
					minTeamCount: 16,
				},
			],
			day: [null, 1, 15, 31],
			month: [null, 0, 11],
			year: [null, 2015, 2026, 2100],
		});
	});

	it("decodes garbage to defaults", () => {
		assertDecodesToDefault(calendarSearchParams, "filters", [
			["not-json"],
			["[1,2,3]"],
			['"foo"'],
			['{"preferredStartTime":"XX"}'],
		]);
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

	it("keeps valid fields when part of the filters blob is invalid", () => {
		const parsed = calendarSearchParams.parse(
			new URL(
				`http://localhost/calendar?filters=${encodeURIComponent(
					JSON.stringify({ isSendou: true, games: ["BAD"] }),
				)}`,
			),
		);

		expect(parsed.filters).toEqual({
			...CalendarEvent.defaultFilters(),
			isSendou: true,
		});
	});
});

describe("calendarEventsSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(calendarEventsSearchParams, {
			view: [null, "registered", "hosting", "scrims", "saved", "organization"],
		});
	});

	it("decodes garbage to defaults", () => {
		assertDecodesToDefault(calendarEventsSearchParams, "view", [
			["invalid"],
			["Registered"],
			[""],
		]);
	});
});

describe("calendarNewSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(calendarNewSearchParams, {
			eventId: [null, 1, 12345],
			copyEventId: [null, 99],
			tournament: [false, true],
		});
	});

	it("decodes garbage to defaults", () => {
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
