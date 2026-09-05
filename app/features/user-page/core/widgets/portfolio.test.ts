import { describe, expect, test } from "vitest";
import { widgetsWithinLimits } from "./portfolio";
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

describe("widgetsWithinLimits", () => {
	test("keeps widgets that fit in both slots", () => {
		const widgets = [...MAIN_WIDGETS.slice(0, 4), ...SIDE_WIDGETS.slice(0, 5)];

		expect(widgetsWithinLimits(widgets, false)).toEqual(widgets);
	});

	test("drops main widgets over the limit keeping the first ones", () => {
		expect(idsOf(widgetsWithinLimits(MAIN_WIDGETS, false))).toEqual([
			"weapon-pool",
			"trophies-owned",
			"badges-owned",
			"badges-authored",
		]);
	});

	test("drops side widgets over the limit keeping the first ones", () => {
		expect(idsOf(widgetsWithinLimits(SIDE_WIDGETS, false))).toEqual([
			"teams",
			"friends",
			"organizations",
			"join-date",
			"peak-sp",
		]);
	});

	test("allows supporters more widgets per slot", () => {
		expect(widgetsWithinLimits(MAIN_WIDGETS, true)).toHaveLength(6);
		expect(widgetsWithinLimits(SIDE_WIDGETS, true)).toHaveLength(7);
	});

	test("keeps widgets of an unknown id", () => {
		const widgets = [{ id: "removed-widget" } as unknown as StoredWidget];

		expect(widgetsWithinLimits(widgets, false)).toEqual(widgets);
	});
});
