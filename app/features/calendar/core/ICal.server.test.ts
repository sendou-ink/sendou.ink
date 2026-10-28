import { describe, expect, test } from "vitest";
import type { CalendarEvent } from "../calendar-types";
import * as ICal from "./ICal.server";

describe("ICal.getICalendar", () => {
	test("gives each day of a multi-day event its own UID", async () => {
		const saturday = makeEvent({ at: Date.UTC(2026, 9, 24, 16) });
		const sunday = makeEvent({ at: Date.UTC(2026, 9, 25, 16) });

		const ical = await ICal.getICalendar([saturday, sunday]);

		const uids = [...ical!.matchAll(/^UID:(.+)$/gm)].map((match) => match[1]);
		expect(uids).toHaveLength(2);
		expect(new Set(uids).size).toBe(2);
	});
});

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
	return {
		at: Date.now(),
		id: 1,
		isRanked: null,
		tier: null,
		tentativeTier: null,
		tags: [],
		modes: ["SZ"],
		teamsCount: 2,
		membersCount: 8,
		minMembersPerTeam: 4,
		organization: null,
		authorId: 1,
		type: "calendar",
		normalizedTeamCount: 0,
		badges: [],
		trophy: null,
		logoUrl: null,
		name: "Two Day Cup",
		url: "/to/1",
		...overrides,
	};
}
