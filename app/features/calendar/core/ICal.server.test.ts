import { describe, expect, test } from "vitest";
import type { SidebarEvent } from "~/features/sidebar/core/sidebar.server";
import type { CalendarEvent } from "../calendar-types";
import * as ICal from "./ICal.server";

describe("ICal.feed", () => {
	test("gives each day of a multi-day event its own UID", () => {
		const saturday = makeCalendarEvent({ at: Date.UTC(2026, 9, 24, 16) });
		const sunday = makeCalendarEvent({ at: Date.UTC(2026, 9, 25, 16) });

		const ical = ICal.feed({
			productId: "test",
			events: [saturday, sunday].map(ICal.fromCalendarEvent),
		});

		const uids = [...ical!.matchAll(/^UID:(.+)$/gm)].map((match) => match[1]);
		expect(uids).toHaveLength(2);
		expect(new Set(uids).size).toBe(2);
	});

	test("builds a named calendar even with no events", () => {
		const ical = ICal.feed({
			productId: "test",
			name: "sendou.ink events",
			events: [],
		});

		expect(ical).toContain("X-WR-CALNAME:sendou.ink events");
		expect(ical).not.toContain("BEGIN:VEVENT");
	});

	test("links the event's page with an absolute URL", () => {
		const ical = ICal.feed({
			productId: "test",
			events: [ICal.fromSidebarEvent(makeSidebarEvent({ url: "/to/5" }))],
		});

		expect(ical).toMatch(/^URL:https?:\/\/.+\/to\/5\r?$/m);
	});
});

describe("ICal.fromSidebarEvent", () => {
	test("uses the event's own end when it has one", () => {
		const event = ICal.fromSidebarEvent(
			makeSidebarEvent({
				type: "teamEvent",
				startsAt: 1_800_000_000,
				endsAt: 1_800_000_000 + 30 * 60,
			}),
		);

		expect(event.endsAt - event.startsAt).toBe(30 * 60 * 1000);
	});

	test("gives an event without an end a length by its type", () => {
		const event = ICal.fromSidebarEvent(
			makeSidebarEvent({ type: "leagueMatch", startsAt: 1_800_000_000 }),
		);

		expect(event.startsAt).toBe(1_800_000_000 * 1000);
		expect(event.endsAt - event.startsAt).toBe(60 * 60 * 1000);
	});

	test("titles a scrim by its opponent", () => {
		const event = ICal.fromSidebarEvent(
			makeSidebarEvent({ type: "scrim", name: "Team Olive" }),
		);

		expect(event.title).toBe("Scrim vs. Team Olive");
	});

	test("events of different types with the same id get different UIDs", () => {
		const scrim = ICal.fromSidebarEvent(
			makeSidebarEvent({ type: "scrim", id: 1 }),
		);
		const tournament = ICal.fromSidebarEvent(
			makeSidebarEvent({ type: "tournament", id: 1 }),
		);

		expect(scrim.uid).not.toBe(tournament.uid);
	});
});

function makeSidebarEvent(overrides: Partial<SidebarEvent> = {}): SidebarEvent {
	return {
		id: 1,
		name: "In The Zone",
		url: "/to/1",
		logoUrl: null,
		user: null,
		startsAt: 1_800_000_000,
		type: "tournament",
		...overrides,
	};
}

function makeCalendarEvent(
	overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
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
		trophyId: null,
		venue: null,
		logoUrl: null,
		name: "Two Day Cup",
		url: "/to/1",
		...overrides,
	};
}
