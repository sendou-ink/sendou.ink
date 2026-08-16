import { describe, expect, test } from "vitest";
import * as SearchParams from "~/modules/search-params/search-params";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { DEFAULT_TIERS } from "./tier-list-maker-constants";
import type { TierListState } from "./tier-list-maker-schemas";
import { tierListMakerSearchParams } from "./tier-list-maker-search-params";

const FILLED_STATE: TierListState = {
	tiers: [
		{ id: "tier-a", name: "A", color: "#ffffff" },
		{ id: "tier-b", name: "B", color: "#000000" },
	],
	tierItems: new Map([
		["tier-a", [{ type: "main-weapon" as const, id: 40 }]],
		["tier-b", [{ type: "main-weapon" as const, id: 1010, nth: 2 }]],
	]),
};

describe("tierListMakerSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(tierListMakerSearchParams, {
			state: [
				{ tiers: DEFAULT_TIERS, tierItems: new Map() },
				FILLED_STATE,
				{ tiers: [], tierItems: new Map() },
			],
			type: ["main-weapon", "stage", "ability"],
			title: ["", "Weapons ranked & sorted"],
			showTierHeaders: [true, false],
			hideAltKits: [true, false],
			hideAltSkins: [true, false],
			canAddDuplicates: [true, false],
			modes: [["SZ", "TC", "RM", "CB"], ["SZ"], []],
		});
	});

	test("always emits the compressed form for state", () => {
		const encoded = SearchParams.encodeParam(
			tierListMakerSearchParams.shape.state,
			FILLED_STATE,
		);

		expect(encoded).toHaveLength(1);
		expect(encoded[0]).toMatch(/^lz~/);
	});

	test("decodes the legacy JSON modes format", () => {
		expect(
			SearchParams.decodeParam(tierListMakerSearchParams.shape.modes, [
				'["SZ","TC"]',
			]),
		).toEqual(["SZ", "TC"]);
	});

	test("decodes garbage to defaults", () => {
		assertDecodesToDefault(tierListMakerSearchParams, "state", [
			[""],
			["garbage"],
			["lz~%%%"],
			['{"tiers":[]}'],
		]);
		assertDecodesToDefault(tierListMakerSearchParams, "type", [[""], ["nope"]]);
	});
});
