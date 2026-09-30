import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { DEFAULT_WIDGETS } from "./core/widgets/portfolio";
import { widgetsEditSchema } from "./user-page-schemas";

describe("widgetsEditSchema", () => {
	test("accepts the default layout saved without changes", () => {
		const result = v.safeParse(widgetsEditSchema(false), {
			widgets: JSON.stringify(DEFAULT_WIDGETS),
		});

		expect(result.success).toBe(true);
	});

	test("rejects an empty widget list", () => {
		const result = v.safeParse(widgetsEditSchema(false), {
			widgets: JSON.stringify([]),
		});

		expect(result.success).toBe(false);
	});

	test("rejects the same widget twice", () => {
		const result = v.safeParse(widgetsEditSchema(false), {
			widgets: JSON.stringify([{ id: "join-date" }, { id: "join-date" }]),
		});

		expect(result.success).toBe(false);
	});

	test.each([
		{
			why: "timezone outside the known list",
			widget: { id: "timezone", settings: { timezone: "Mars/Olympus_Mons" } },
		},
		{
			why: "peak XP below the minimum",
			widget: {
				id: "peak-xp-unverified",
				settings: { peakXp: 0, division: "tentatek" },
			},
		},
		{
			why: "peak XP above the maximum",
			widget: {
				id: "peak-xp-unverified",
				settings: { peakXp: 99999, division: "tentatek" },
			},
		},
		{
			why: "sensitivity outside the selectable values",
			widget: {
				id: "sens",
				settings: { controller: "s1-pro-con", motionSens: 51, stickSens: null },
			},
		},
		{
			why: "the same weapon twice in the weapon pool widget",
			widget: {
				id: "weapon-pool",
				settings: {
					weaponPool: [
						{ id: 40, isFavorite: false },
						{ id: 40, isFavorite: true },
					],
				},
			},
		},
		{
			why: "more weapons than the weapon pool widget allows",
			widget: {
				id: "weapon-pool",
				settings: {
					weaponPool: [0, 10, 20, 30, 40, 50, 60, 70].map((id) => ({
						id,
						isFavorite: false,
					})),
				},
			},
		},
	])("rejects $why", ({ widget }) => {
		const result = v.safeParse(widgetsEditSchema(true), {
			widgets: JSON.stringify([widget]),
		});

		expect(result.success).toBe(false);
	});

	test.each([
		{
			why: "a timezone from the known list",
			widget: { id: "timezone", settings: { timezone: "Europe/Helsinki" } },
		},
		{
			why: "a four digit peak XP",
			widget: {
				id: "peak-xp-unverified",
				settings: { peakXp: 3123, division: "takoroka" },
			},
		},
		{
			why: "a selectable sensitivity",
			widget: {
				id: "sens",
				settings: { controller: "s1-pro-con", motionSens: -25, stickSens: 5 },
			},
		},
		{
			why: "an empty weapon pool widget list",
			widget: { id: "weapon-pool", settings: { weaponPool: [] } },
		},
		{
			why: "a weapon pool widget list with a favorite",
			widget: {
				id: "weapon-pool",
				settings: { weaponPool: [{ id: 40, isFavorite: true }] },
			},
		},
	])("accepts $why", ({ widget }) => {
		const result = v.safeParse(widgetsEditSchema(true), {
			widgets: JSON.stringify([widget]),
		});

		expect(result.success).toBe(true);
	});
});
