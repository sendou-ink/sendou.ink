import { describe, expect, test } from "vitest";
import { TIER_LIST_SEARCH_PARAM_NAMES } from "./tier-list-maker-constants";
import type { TierListItem, TierListState } from "./tier-list-maker-schemas";
import { tierListMakerSearchParams } from "./tier-list-maker-search-params";
import {
	addItemToTier,
	getNextNthForItem,
	tierListItemId,
	tierListMakerPathWithState,
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
	test("appends the item to the target tier", () => {
		const state = makeState();

		const result = addItemToTier(state, "tier-a", splattershot);

		expect(result.tierItems.get("tier-a")).toEqual([splattershot]);
	});

	test("appends to the end keeping existing items", () => {
		const state = makeState({ "tier-a": [splattershot] });

		const result = addItemToTier(state, "tier-a", splatRoller);

		expect(result.tierItems.get("tier-a")).toEqual([splattershot, splatRoller]);
	});

	test("does not mutate the original state", () => {
		const state = makeState({ "tier-a": [splattershot] });

		addItemToTier(state, "tier-a", splatRoller);

		expect(state.tierItems.get("tier-a")).toEqual([splattershot]);
	});

	test("leaves other tiers untouched", () => {
		const state = makeState({ "tier-b": [splatRoller] });

		const result = addItemToTier(state, "tier-a", splattershot);

		expect(result.tierItems.get("tier-b")).toEqual([splatRoller]);
	});

	test("returns the same state reference when the tier does not exist", () => {
		const state = makeState();

		const result = addItemToTier(state, "tier-missing", splattershot);

		expect(result).toBe(state);
	});
});

describe("getNextNthForItem", () => {
	test("returns 1 when the item is not yet placed", () => {
		const state = makeState();

		expect(getNextNthForItem(splattershot, state)).toBe(1);
	});

	test("returns max nth + 1 across all tiers", () => {
		const state = makeState({
			"tier-a": [splattershot],
			"tier-b": [{ ...splattershot, nth: 2 }],
		});

		expect(getNextNthForItem(splattershot, state)).toBe(3);
	});
});

describe("tierListMakerPathWithState", () => {
	function parseStateFromPath(path: string): TierListState {
		const searchParams = new URLSearchParams(path.split("?")[1]);

		return tierListMakerSearchParams.parse(searchParams).state;
	}

	test("round trips the tier list state", () => {
		const state = makeState({
			"tier-a": [splattershot, { ...splatRoller, nth: 2 }],
			"tier-b": [splatRoller],
		});

		const path = tierListMakerPathWithState({
			state,
			title: "",
			showTierHeaders: true,
		});

		expect(parseStateFromPath(path)).toEqual(state);
	});

	test("includes the title", () => {
		const path = tierListMakerPathWithState({
			state: makeState(),
			title: "Weapons ranked & sorted",
			showTierHeaders: true,
		});

		expect(
			new URLSearchParams(path.split("?")[1]).get(
				TIER_LIST_SEARCH_PARAM_NAMES.TITLE,
			),
		).toBe("Weapons ranked & sorted");
	});

	test("only includes tier headers param when they are hidden", () => {
		const withHeaders = tierListMakerPathWithState({
			state: makeState(),
			title: "",
			showTierHeaders: true,
		});
		const withoutHeaders = tierListMakerPathWithState({
			state: makeState(),
			title: "",
			showTierHeaders: false,
		});

		expect(withHeaders).not.toContain(
			TIER_LIST_SEARCH_PARAM_NAMES.SHOW_TIER_HEADERS,
		);
		expect(
			new URLSearchParams(withoutHeaders.split("?")[1]).get(
				TIER_LIST_SEARCH_PARAM_NAMES.SHOW_TIER_HEADERS,
			),
		).toBe("false");
	});
});

describe("tierListItemId", () => {
	test("omits nth when it is not set", () => {
		expect(tierListItemId(splattershot)).toBe("main-weapon:40");
	});

	test("includes nth when set", () => {
		expect(tierListItemId({ ...splattershot, nth: 2 })).toBe(
			"main-weapon:40:2",
		);
	});
});
