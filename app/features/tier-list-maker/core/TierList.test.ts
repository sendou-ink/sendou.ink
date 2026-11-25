import { describe, expect, test } from "vitest";
import { DEFAULT_TIERS } from "../tier-list-maker-constants";
import type { TierListItem, TierListState } from "../tier-list-maker-schemas";
import * as TierList from "./TierList";

const splattershot: TierListItem = { type: "main-weapon", id: 40 };
const splatRoller: TierListItem = { type: "main-weapon", id: 1010 };
const splatCharger: TierListItem = { type: "main-weapon", id: 2010 };

describe("TierList.empty", () => {
	test("has the default tiers with nothing placed", () => {
		const state = TierList.empty();

		expect(state.tiers).toEqual(DEFAULT_TIERS);
		expect(TierList.hasItems(state)).toBe(false);
	});
});

describe("TierList.hasItems", () => {
	test.each<{
		why: string;
		tierItems: Record<string, TierListItem[]>;
		expected: boolean;
	}>([
		{ why: "no tier has items", tierItems: {}, expected: false },
		{
			why: "the tiers are empty",
			tierItems: { "tier-a": [] },
			expected: false,
		},
		{
			why: "a tier has an item",
			tierItems: { "tier-a": [], "tier-b": [splattershot] },
			expected: true,
		},
	])("$why -> $expected", ({ tierItems, expected }) => {
		expect(TierList.hasItems(makeState(tierItems))).toBe(expected);
	});
});

describe("TierList.tierOf", () => {
	test("finds the tier the item is placed in", () => {
		const state = makeState({ "tier-b": [splattershot] });

		expect(TierList.tierOf(state, splattershot)).toBe("tier-b");
	});

	test("returns null for an item in the pool", () => {
		expect(TierList.tierOf(makeState(), splattershot)).toBeNull();
	});

	test("tells duplicates apart by their nth", () => {
		const state = makeState({
			"tier-a": [splattershot],
			"tier-b": [{ ...splattershot, nth: 1 }],
		});

		expect(TierList.tierOf(state, { ...splattershot, nth: 1 })).toBe("tier-b");
	});
});

describe("TierList.addItem", () => {
	test("appends the item to the end of the tier", () => {
		const state = makeState({ "tier-a": [splattershot] });

		const result = TierList.addItem(state, "tier-a", splatRoller);

		expect(result.tierItems.get("tier-a")).toEqual([splattershot, splatRoller]);
	});

	test("does not change the original state", () => {
		const state = makeState({ "tier-a": [splattershot] });

		TierList.addItem(state, "tier-a", splatRoller);

		expect(state.tierItems.get("tier-a")).toEqual([splattershot]);
	});

	test("returns the same state when the tier does not exist", () => {
		const state = makeState();

		expect(TierList.addItem(state, "tier-missing", splattershot)).toBe(state);
	});
});

describe("TierList.moveItem", () => {
	test("puts an item from the pool in the place of the item it is over", () => {
		const state = makeState({ "tier-a": [splatRoller, splatCharger] });

		const result = TierList.moveItem(state, {
			item: splattershot,
			toTierId: "tier-a",
			overItem: splatCharger,
		});

		expect(result.tierItems.get("tier-a")).toEqual([
			splatRoller,
			splattershot,
			splatCharger,
		]);
	});

	test("takes the item out of the tier it was in", () => {
		const state = makeState({ "tier-a": [splattershot, splatRoller] });

		const result = TierList.moveItem(state, {
			item: splattershot,
			toTierId: "tier-b",
			overItem: null,
		});

		expect(result.tierItems.get("tier-a")).toEqual([splatRoller]);
		expect(result.tierItems.get("tier-b")).toEqual([splattershot]);
	});

	test("appends the item when the item it is over is not in the tier", () => {
		const state = makeState({ "tier-b": [splatRoller] });

		const result = TierList.moveItem(state, {
			item: splattershot,
			toTierId: "tier-b",
			overItem: splatCharger,
		});

		expect(result.tierItems.get("tier-b")).toEqual([splatRoller, splattershot]);
	});
});

describe("TierList.reorderItem", () => {
	test("moves the item to the place of the other item of its tier", () => {
		const state = makeState({
			"tier-a": [splattershot, splatRoller, splatCharger],
		});

		const result = TierList.reorderItem(state, splattershot, splatCharger);

		expect(result.tierItems.get("tier-a")).toEqual([
			splatRoller,
			splatCharger,
			splattershot,
		]);
	});

	test("returns the same state when the items are in different tiers", () => {
		const state = makeState({
			"tier-a": [splattershot],
			"tier-b": [splatRoller],
		});

		expect(TierList.reorderItem(state, splattershot, splatRoller)).toBe(state);
	});
});

describe("TierList.removeItem", () => {
	test("takes the item out of its tier", () => {
		const state = makeState({ "tier-a": [splattershot, splatRoller] });

		const result = TierList.removeItem(state, splattershot);

		expect(result.tierItems.get("tier-a")).toEqual([splatRoller]);
	});

	test("leaves the other copies of a duplicated item", () => {
		const copy = { ...splattershot, nth: 1 };
		const state = makeState({ "tier-a": [splattershot, copy] });

		const result = TierList.removeItem(state, splattershot);

		expect(result.tierItems.get("tier-a")).toEqual([copy]);
	});
});

describe("TierList.addTier", () => {
	test("adds an empty grey tier named New to the bottom", () => {
		const result = TierList.addTier(makeState(), "tier-new");

		expect(result.tiers.at(-1)).toEqual({
			id: "tier-new",
			name: "New",
			color: "#888888",
		});
		expect(result.tiers).toHaveLength(3);
	});
});

describe("TierList.removeTier", () => {
	test("deletes the tier and puts its items back in the pool", () => {
		const state = makeState({ "tier-a": [splattershot] });

		const result = TierList.removeTier(state, "tier-a");

		expect(result.tiers.map((tier) => tier.id)).toEqual(["tier-b"]);
		expect(TierList.tierOf(result, splattershot)).toBeNull();
	});
});

describe("TierList.updateTier", () => {
	test("renames and recolors only the given tier", () => {
		const result = TierList.updateTier(makeState(), "tier-a", {
			name: "Best",
			color: "#4169e1",
		});

		expect(result.tiers).toEqual([
			{ id: "tier-a", name: "Best", color: "#4169e1" },
			{ id: "tier-b", name: "B", color: "#000000" },
		]);
	});

	test("keeps the fields not given", () => {
		const result = TierList.updateTier(makeState(), "tier-a", { name: "Best" });

		expect(result.tiers[0].color).toBe("#ffffff");
	});
});

describe("TierList.moveTier", () => {
	test("moves the tier to the place of the other, shifting the ones in between", () => {
		const state = TierList.empty();

		const result = TierList.moveTier(state, "tier-x", "tier-a");

		expect(result.tiers.map((tier) => tier.id)).toEqual([
			"tier-s",
			"tier-a",
			"tier-x",
			"tier-b",
			"tier-c",
		]);
	});

	test.each([
		{ why: "onto itself", over: "tier-a" },
		{ why: "onto a tier that does not exist", over: "tier-missing" },
	])("returns the same state when moved $why", ({ over }) => {
		const state = makeState();

		expect(TierList.moveTier(state, "tier-a", over)).toBe(state);
	});
});

function makeState(
	tierItems: Record<string, TierListItem[]> = {},
): TierListState {
	return {
		tiers: [
			{ id: "tier-a", name: "A", color: "#ffffff" },
			{ id: "tier-b", name: "B", color: "#000000" },
		],
		tierItems: new Map(Object.entries(tierItems)),
	};
}
