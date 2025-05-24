import { describe, expect, it } from "vitest";
import type {
	CalendarEvent as CalendarEventType,
	CalendarFilters,
} from "../calendar-types";
import * as CalendarEvent from "./CalendarEvent";

function makeEvent(
	overrides: Partial<CalendarEventType> = {},
): CalendarEventType {
	return {
		at: new Date().getTime(),
		id: 1,
		isRanked: null,
		tags: [],
		modes: ["SZ"],
		teamsCount: 2,
		organization: null,
		authorId: 1,
		type: "calendar",
		normalizedTeamCount: 0,
		badges: [],
		logoUrl: null,
		name: "",
		url: "",
		...overrides,
	};
}

describe("CalendarEvent.applyFilters", () => {
	it("returns all events as shown with default filters", () => {
		const events = [
			{
				at: 123,
				events: [makeEvent({ id: 1 }), makeEvent({ id: 2 })],
			},
		];
		const result = CalendarEvent.applyFilters(
			events,
			CalendarEvent.defaultFilters(),
		);
		expect(result[0].events.shown).toHaveLength(2);
		expect(result[0].events.hidden).toHaveLength(0);
	});

	it("filters by isRanked", () => {
		const events = [
			{
				at: 123,
				events: [
					makeEvent({ id: 1, isRanked: true }),
					makeEvent({ id: 2, isRanked: false }),
					makeEvent({ id: 3, isRanked: null }),
				],
			},
		];
		const filters: CalendarFilters = {
			...CalendarEvent.defaultFilters(),
			isRanked: true,
		};
		const result = CalendarEvent.applyFilters(events, filters);
		expect(result[0].events.shown).toHaveLength(1);
		expect(result[0].events.shown[0].id).toBe(1);
		expect(result[0].events.hidden).toHaveLength(2);
	});

	it("filters by tagsIncluded", () => {
		const events = [
			{
				at: 123,
				events: [
					makeEvent({ id: 1, tags: ["MONEY", "ART"] }),
					makeEvent({ id: 2, tags: ["LOW"] }),
				],
			},
		];
		const filters: CalendarFilters = {
			...CalendarEvent.defaultFilters(),
			tagsIncluded: ["MONEY"],
		};
		const result = CalendarEvent.applyFilters(events, filters);
		expect(result[0].events.shown).toHaveLength(1);
		expect(result[0].events.shown[0].id).toBe(1);
	});

	it("filters by tagsExcluded", () => {
		const events = [
			{
				at: 123,
				events: [
					makeEvent({ id: 1, tags: ["MONEY"] }),
					makeEvent({ id: 2, tags: ["ART"] }),
				],
			},
		];
		const filters: CalendarFilters = {
			...CalendarEvent.defaultFilters(),
			tagsExcluded: ["MONEY"],
		};
		const result = CalendarEvent.applyFilters(events, filters);
		expect(result[0].events.shown).toHaveLength(1);
		expect(result[0].events.shown[0].id).toBe(2);
	});

	it("filters by games", () => {
		const events = [
			{
				at: 123,
				events: [
					makeEvent({ id: 1, tags: ["S1"] }),
					makeEvent({ id: 2, tags: ["S2"] }),
					makeEvent({ id: 3, tags: [] }), // S3
				],
			},
		];
		const filters: CalendarFilters = {
			...CalendarEvent.defaultFilters(),
			games: ["S1"],
		};
		const result = CalendarEvent.applyFilters(events, filters);
		expect(result[0].events.shown).toHaveLength(1);
		expect(result[0].events.shown[0].id).toBe(1);
	});

	it("filters by preferredVersus", () => {
		const events = [
			{
				at: 123,
				events: [
					makeEvent({ id: 1, tags: ["ONES"] }),
					makeEvent({ id: 2, tags: ["DUOS"] }),
					makeEvent({ id: 3, tags: ["TRIOS"] }),
					makeEvent({ id: 4, tags: [] }), // 4v4
				],
			},
		];
		const filters: CalendarFilters = {
			...CalendarEvent.defaultFilters(),
			preferredVersus: ["1v1", "2v2"],
		};
		const result = CalendarEvent.applyFilters(events, filters);
		expect(result[0].events.shown.map((e) => e.id)).toEqual([1, 2]);
	});

	it("filters by modes (not exact)", () => {
		const events = [
			{
				at: 123,
				events: [
					makeEvent({ id: 1, modes: ["SZ"] }),
					makeEvent({ id: 2, modes: ["TC"] }),
				],
			},
		];
		const filters: CalendarFilters = {
			...CalendarEvent.defaultFilters(),
			modes: ["SZ"],
		};
		const result = CalendarEvent.applyFilters(events, filters);
		expect(result[0].events.shown.map((e) => e.id)).toEqual([1]);
	});

	it("filters by modes (exact)", () => {
		const events = [
			{
				at: 123,
				events: [
					makeEvent({ id: 1, modes: ["SZ", "TC"] }),
					makeEvent({ id: 2, modes: ["SZ"] }),
				],
			},
		];
		const filters: CalendarFilters = {
			...CalendarEvent.defaultFilters(),
			modes: ["SZ"],
			modesExact: true,
		};
		const result = CalendarEvent.applyFilters(events, filters);
		expect(result[0].events.shown.map((e) => e.id)).toEqual([2]);
	});

	it("filters by minTeamCount", () => {
		const events = [
			{
				at: 123,
				events: [
					makeEvent({ id: 1, teamsCount: 2 }),
					makeEvent({ id: 2, teamsCount: 4 }),
				],
			},
		];
		const filters: CalendarFilters = {
			...CalendarEvent.defaultFilters(),
			minTeamCount: 3,
		};
		const result = CalendarEvent.applyFilters(events, filters);
		expect(result[0].events.shown.map((e) => e.id)).toEqual([2]);
	});

	it("filters by orgsIncluded", () => {
		const events = [
			{
				at: 123,
				events: [
					makeEvent({ id: 1, organization: { name: "OrgA" } as any }),
					makeEvent({ id: 2, organization: { name: "OrgB" } as any }),
					makeEvent({ id: 3, organization: undefined }),
				],
			},
		];
		const filters: CalendarFilters = {
			...CalendarEvent.defaultFilters(),
			orgsIncluded: ["OrgA"],
		};
		const result = CalendarEvent.applyFilters(events, filters);
		expect(result[0].events.shown.map((e) => e.id)).toEqual([1]);
	});

	it("filters by orgsExcluded", () => {
		const events = [
			{
				at: 123,
				events: [
					makeEvent({ id: 1, organization: { name: "OrgA" } as any }),
					makeEvent({ id: 2, organization: { name: "OrgB" } as any }),
					makeEvent({ id: 3, organization: undefined }),
				],
			},
		];
		const filters: CalendarFilters = {
			...CalendarEvent.defaultFilters(),
			orgsExcluded: ["OrgA"],
		};
		const result = CalendarEvent.applyFilters(events, filters);
		expect(result[0].events.shown.map((e) => e.id)).toEqual([2, 3]);
	});

	it("filters by authorIdsExcluded", () => {
		const events = [
			{
				at: 123,
				events: [
					makeEvent({ id: 1, authorId: 1 }),
					makeEvent({ id: 2, authorId: 2 }),
				],
			},
		];
		const filters: CalendarFilters = {
			...CalendarEvent.defaultFilters(),
			authorIdsExcluded: [1],
		};
		const result = CalendarEvent.applyFilters(events, filters);
		expect(result[0].events.shown.map((e) => e.id)).toEqual([2]);
	});

	it("filters by combining two different filters", () => {
		const events = [
			{
				at: 123,
				events: [
					makeEvent({ id: 1, tags: ["MONEY"], isRanked: true }),
					makeEvent({ id: 2, tags: ["LOW"], isRanked: false }),
					makeEvent({ id: 3, tags: ["MONEY"], isRanked: false }),
				],
			},
		];
		const filters: CalendarFilters = {
			...CalendarEvent.defaultFilters(),
			tagsIncluded: ["MONEY"],
			isRanked: true,
		};
		const result = CalendarEvent.applyFilters(events, filters);
		expect(result[0].events.shown.map((e) => e.id)).toEqual([1]);
	});
});
