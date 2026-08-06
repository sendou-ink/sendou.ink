import { describe, expect, test } from "vitest";
import * as CalendarEventFactory from "~/db/seed/factories/CalendarEventFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { wrappedLoader } from "~/utils/Test";
import type { GetCalendarWeekResponse } from "../schema";
import { loader } from "./calendar.$year.$week";

const weekLoader = wrappedLoader<Response>({ loader });

const fetchWeek = async (year: number, week: number) => {
	const response = await weekLoader({
		params: { year: String(year), week: String(week) },
	});

	return (await response.json()) as GetCalendarWeekResponse;
};

describe("GET /api/calendar/:year/:week", () => {
	test("an event starting exactly at the week boundary is returned for exactly one week", async () => {
		const user = await UserFactory.createRegular();
		// Monday 2025-01-13 00:00 UTC, i.e. Sunday 7 PM EST — the boundary
		// between ISO weeks 2 and 3 of 2025
		await CalendarEventFactory.create({
			authorId: user.id,
			startTimes: [dateToDatabaseTimestamp(new Date("2025-01-13T00:00:00Z"))],
		});

		const weekTwoEvents = await fetchWeek(2025, 2);
		const weekThreeEvents = await fetchWeek(2025, 3);

		expect(weekTwoEvents.length + weekThreeEvents.length).toBe(1);
	});
});
