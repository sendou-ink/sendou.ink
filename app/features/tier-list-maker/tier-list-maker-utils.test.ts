import { describe, expect, it } from "vitest";
import type { TierListItem, TierListState } from "./tier-list-maker-schemas";
import {
	addItemToTier,
	getNextNthForItem,
	tierListItemId,
} from "./tier-list-maker-utils";

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

const splattershot: TierListItem = { type: "main-weapon", id: 40 };
const splatRoller: TierListItem = { type: "main-weapon", id: 1010 };

describe("addItemToTier", () => {
	it("appends the item to the target tier", () => {
		const state = makeState();

		const result = addItemToTier(state, "tier-a", splattershot);

		expect(result.tierItems.get("tier-a")).toEqual([splattershot]);
	});

	it("appends to the end keeping existing items", () => {
		const state = makeState({ "tier-a": [splattershot] });

		const result = addItemToTier(state, "tier-a", splatRoller);

		expect(result.tierItems.get("tier-a")).toEqual([splattershot, splatRoller]);
	});

	it("does not mutate the original state", () => {
		const state = makeState({ "tier-a": [splattershot] });

		addItemToTier(state, "tier-a", splatRoller);

		expect(state.tierItems.get("tier-a")).toEqual([splattershot]);
	});

	it("leaves other tiers untouched", () => {
		const state = makeState({ "tier-b": [splatRoller] });

		const result = addItemToTier(state, "tier-a", splattershot);

		expect(result.tierItems.get("tier-b")).toEqual([splatRoller]);
	});

	it("returns the same state reference when the tier does not exist", () => {
		const state = makeState();

		const result = addItemToTier(state, "tier-missing", splattershot);

		expect(result).toBe(state);
	});
});

describe("getNextNthForItem", () => {
	it("returns 1 when the item is not yet placed", () => {
		const state = makeState();

		expect(getNextNthForItem(splattershot, state)).toBe(1);
	});

	it("returns max nth + 1 across all tiers", () => {
		const state = makeState({
			"tier-a": [splattershot],
			"tier-b": [{ ...splattershot, nth: 2 }],
		});

		expect(getNextNthForItem(splattershot, state)).toBe(3);
	});
});

describe("tierListItemId", () => {
	it("omits nth when it is not set", () => {
		expect(tierListItemId(splattershot)).toBe("main-weapon:40");
	});

	it("includes nth when set", () => {
		expect(tierListItemId({ ...splattershot, nth: 2 })).toBe(
			"main-weapon:40:2",
		);
	});
});
