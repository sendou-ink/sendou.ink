import { describe, expect, test } from "vitest";
import { widgetsAvailableTo } from "./portfolio";
import type { StoredWidget } from "./types";

const MAIN_WIDGETS: StoredWidget[] = [
	{ id: "weapon-pool" },
	{ id: "trophies-owned" },
	{ id: "badges-owned" },
	{ id: "badges-authored" },
	{ id: "badges-managed" },
	{ id: "builds" },
	{ id: "videos" },
];

const SIDE_WIDGETS: StoredWidget[] = [
	{ id: "teams" },
	{ id: "friends" },
	{ id: "organizations" },
	{ id: "join-date" },
	{ id: "peak-sp" },
	{ id: "peak-xp" },
	{ id: "commissions" },
	{ id: "social-links" },
];

const idsOf = (widgets: StoredWidget[]) => widgets.map((widget) => widget.id);

describe("widgetsAvailableTo", () => {
	test("keeps widgets that fit in both slots", () => {
		const widgets = [...MAIN_WIDGETS.slice(0, 4), ...SIDE_WIDGETS.slice(0, 5)];

		expect(widgetsAvailableTo(widgets, false)).toEqual(widgets);
	});

	test("drops main widgets over the limit keeping the first ones", () => {
		expect(idsOf(widgetsAvailableTo(MAIN_WIDGETS, false))).toEqual([
			"weapon-pool",
			"trophies-owned",
			"badges-owned",
			"badges-authored",
		]);
	});

	test("drops side widgets over the limit keeping the first ones", () => {
		expect(idsOf(widgetsAvailableTo(SIDE_WIDGETS, false))).toEqual([
			"teams",
			"friends",
			"organizations",
			"join-date",
			"peak-sp",
		]);
	});

	test("allows supporters more widgets per slot", () => {
		expect(widgetsAvailableTo(MAIN_WIDGETS, true)).toHaveLength(6);
		expect(widgetsAvailableTo(SIDE_WIDGETS, true)).toHaveLength(7);
	});

	test("drops supporter only widgets from a non supporter", () => {
		const widgets: StoredWidget[] = [
			{ id: "join-date" },
			{ id: "patron-since" },
			{ id: "links", settings: { links: [] } },
			{ id: "teams" },
		];

		expect(idsOf(widgetsAvailableTo(widgets, false))).toEqual([
			"join-date",
			"teams",
		]);
	});

	test("keeps supporter only widgets for a supporter", () => {
		const widgets: StoredWidget[] = [{ id: "patron-since" }];

		expect(widgetsAvailableTo(widgets, true)).toEqual(widgets);
	});

	test("dropped supporter only widgets do not take up a slot", () => {
		const widgets: StoredWidget[] = [
			{ id: "patron-since" },
			...SIDE_WIDGETS.slice(0, 5),
		];

		expect(idsOf(widgetsAvailableTo(widgets, false))).toEqual(
			idsOf(SIDE_WIDGETS.slice(0, 5)),
		);
	});

	test("keeps widgets of an unknown id", () => {
		const widgets = [{ id: "removed-widget" } as unknown as StoredWidget];

		expect(widgetsAvailableTo(widgets, false)).toEqual(widgets);
	});
});
