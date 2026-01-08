import { describe, expect, test } from "vitest";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	DEFAULT_LFG_FILTERS,
	decodeFiltersState,
	encodeFiltersState,
	type LFGFiltersState,
} from "./lfg-types";

describe("encodeFiltersState()", () => {
	test("returns empty string for default filters", () => {
		expect(encodeFiltersState(DEFAULT_LFG_FILTERS)).toBe("");
	});

	test("encodes weapon filter", () => {
		const filters: LFGFiltersState = {
			...DEFAULT_LFG_FILTERS,
			weapon: [10, 20] as MainWeaponId[],
		};
		expect(encodeFiltersState(filters)).toBe("w.10,20");
	});

	test("encodes type filter", () => {
		const filters: LFGFiltersState = {
			...DEFAULT_LFG_FILTERS,
			type: "TEAM_FOR_PLAYER",
		};
		expect(encodeFiltersState(filters)).toBe("t.2");
	});

	test("encodes timezone filter", () => {
		const filters: LFGFiltersState = {
			...DEFAULT_LFG_FILTERS,
			timezone: 8,
		};
		expect(encodeFiltersState(filters)).toBe("tz.8");
	});

	test("encodes language filter", () => {
		const filters: LFGFiltersState = {
			...DEFAULT_LFG_FILTERS,
			language: "en",
		};
		expect(encodeFiltersState(filters)).toBe("l.en");
	});

	test("encodes plusTier filter", () => {
		const filters: LFGFiltersState = {
			...DEFAULT_LFG_FILTERS,
			plusTier: 2,
		};
		expect(encodeFiltersState(filters)).toBe("pt.2");
	});

	test("encodes minTier filter", () => {
		const filters: LFGFiltersState = {
			...DEFAULT_LFG_FILTERS,
			minTier: "GOLD",
		};
		expect(encodeFiltersState(filters)).toBe("mn.3");
	});

	test("encodes maxTier filter", () => {
		const filters: LFGFiltersState = {
			...DEFAULT_LFG_FILTERS,
			maxTier: "SILVER",
		};
		expect(encodeFiltersState(filters)).toBe("mx.4");
	});

	test("encodes multiple filters with dash delimiter", () => {
		const filters: LFGFiltersState = {
			...DEFAULT_LFG_FILTERS,
			weapon: [10] as MainWeaponId[],
			type: "PLAYER_FOR_TEAM",
			timezone: 4,
		};
		expect(encodeFiltersState(filters)).toBe("w.10-t.0-tz.4");
	});
});

describe("decodeFiltersState()", () => {
	test("returns default filters for empty string", () => {
		expect(decodeFiltersState("")).toEqual(DEFAULT_LFG_FILTERS);
	});

	test("decodes weapon filter", () => {
		const result = decodeFiltersState("w.10,20,30");
		expect(result.weapon).toEqual([10, 20, 30]);
	});

	test("decodes type filter", () => {
		const result = decodeFiltersState("t.2");
		expect(result.type).toBe("TEAM_FOR_PLAYER");
	});

	test("decodes timezone filter", () => {
		const result = decodeFiltersState("tz.6");
		expect(result.timezone).toBe(6);
	});

	test("decodes language filter", () => {
		const result = decodeFiltersState("l.ja");
		expect(result.language).toBe("ja");
	});

	test("decodes plusTier filter", () => {
		const result = decodeFiltersState("pt.3");
		expect(result.plusTier).toBe(3);
	});

	test("decodes minTier filter", () => {
		const result = decodeFiltersState("mn.1");
		expect(result.minTier).toBe("DIAMOND");
	});

	test("decodes maxTier filter", () => {
		const result = decodeFiltersState("mx.5");
		expect(result.maxTier).toBe("BRONZE");
	});

	test("decodes multiple filters", () => {
		const result = decodeFiltersState("w.10-t.1-tz.8-l.en");
		expect(result.weapon).toEqual([10]);
		expect(result.type).toBe("PLAYER_FOR_COACH");
		expect(result.timezone).toBe(8);
		expect(result.language).toBe("en");
	});

	test("ignores invalid weapon IDs", () => {
		const result = decodeFiltersState("w.abc,10,xyz");
		expect(result.weapon).toEqual([10]);
	});

	test("ignores invalid language codes", () => {
		const result = decodeFiltersState("l.invalid");
		expect(result.language).toBeNull();
	});

	test("ignores invalid type indices", () => {
		const result = decodeFiltersState("t.99");
		expect(result.type).toBeNull();
	});

	test("ignores invalid tier indices", () => {
		const result = decodeFiltersState("mn.99");
		expect(result.minTier).toBeNull();
	});

	test("ignores malformed parts", () => {
		const result = decodeFiltersState("w.10-invalid-t.0");
		expect(result.weapon).toEqual([10]);
		expect(result.type).toBe("PLAYER_FOR_TEAM");
	});
});

describe("encode/decode roundtrip", () => {
	test("roundtrip preserves all filter values", () => {
		const original: LFGFiltersState = {
			weapon: [10, 20] as MainWeaponId[],
			type: "TEAM_FOR_SCRIM",
			timezone: 6,
			language: "ja",
			plusTier: 2,
			minTier: "GOLD",
			maxTier: "PLATINUM",
		};

		const encoded = encodeFiltersState(original);
		const decoded = decodeFiltersState(encoded);

		expect(decoded).toEqual(original);
	});
});
