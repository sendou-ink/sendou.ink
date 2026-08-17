import * as v from "valibot";
import { describe, expect, test } from "vitest";
import * as SearchParams from "./search-params.ts";
import { SP } from "./search-params.ts";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "./search-params-test-utils.ts";

const testDefinition = SearchParams.define({
	limit: SP.param(
		v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
		{
			default: 24,
		},
	),
	name: SP.param(v.pipe(v.string(), v.maxLength(20)), {
		default: "",
	}),
	enabled: SP.param(v.boolean(), { default: false }),
	mode: SP.param(v.picklist(["TW", "SZ", "TC"]), {
		default: "TW",
	}),
	season: SP.param(v.nullable(v.pipe(v.number(), v.integer())), {
	}),
	ids: SP.param(v.array(v.pipe(v.number(), v.integer(), v.minValue(1))), {
		default: [],
	}),
	filters: SP.json(
		v.object({ minValue: v.number(), tags: v.array(v.string()) }),
		{ default: { minValue: 0, tags: [] }, resets: ["limit"] },
	),
	blob: SP.json(v.object({ text: v.string() }), {
		default: { text: "" },
		compress: true,
	}),
});

describe("SearchParams round trips", () => {
	test("round-trips representative and edge-case values", () => {
		assertRoundTrips(testDefinition, {
			limit: [24, 1, 100, 55],
			name: ["", "hello", "with space", "ä&=?#ö", "lz~sneaky", "lz~~x"],
			enabled: [true, false],
			mode: ["TW", "SZ", "TC"],
			season: [null, 5, 0, -3],
			ids: [[], [1], [1, 2, 3]],
			filters: [
				{ minValue: 0, tags: [] },
				{ minValue: 3, tags: ["a", "b"] },
			],
			blob: [{ text: "" }, { text: "a".repeat(500) }],
		});
	});
});

describe("SearchParams.define", () => {
	test("decodes garbage to the default", () => {
		assertDecodesToDefault(testDefinition, "limit", [
			[""],
			["abc"],
			["0"],
			["101"],
			["1.5"],
			["Infinity"],
			["lz~%%%%"],
		]);
		assertDecodesToDefault(testDefinition, "enabled", [
			[""],
			["TRUE"],
			["1"],
			["yes"],
		]);
		assertDecodesToDefault(testDefinition, "mode", [[""], ["RM"], ["tw"]]);
		assertDecodesToDefault(testDefinition, "season", [[""], ["x"]]);
		assertDecodesToDefault(testDefinition, "filters", [
			[""],
			["{"],
			['{"minValue":"nope","tags":[]}'],
			["[1,2,3]"],
		]);
	});

	test("parses a Request, URL and URLSearchParams", () => {
		const url = "http://localhost/builds?limit=50&mode=SZ";
		const expected = { limit: 50, mode: "SZ" };

		expect(testDefinition.parse(new Request(url))).toMatchObject(expected);
		expect(testDefinition.parse(new URL(url))).toMatchObject(expected);
		expect(
			testDefinition.parse(new URLSearchParams("limit=50&mode=SZ")),
		).toMatchObject(expected);
	});

	test("resolves every missing param to its default", () => {
		expect(testDefinition.parse(new URLSearchParams())).toEqual({
			limit: 24,
			name: "",
			enabled: false,
			mode: "TW",
			season: null,
			ids: [],
			filters: { minValue: 0, tags: [] },
			blob: { text: "" },
		});
	});

	test("drops invalid array members instead of the whole array", () => {
		expect(
			testDefinition.parse(new URLSearchParams("ids=1&ids=x&ids=-2&ids=3")).ids,
		).toEqual([1, 3]);
	});

	test("decodes legacy JSON-encoded arrays", () => {
		const definitionWithModes = SearchParams.define({
			modes: SP.param(v.array(v.picklist(["SZ", "TC", "RM", "CB"])), {
				default: ["SZ", "TC", "RM", "CB"],
			}),
		});

		expect(
			SearchParams.decodeParam(definitionWithModes.shape.modes, [
				'["SZ","TC"]',
			]),
		).toEqual(["SZ", "TC"]);
		expect(testDefinition.parse(new URLSearchParams("ids=[1,2]")).ids).toEqual([
			1, 2,
		]);
	});

	test("decodes legacy comma-joined numeric arrays", () => {
		expect(testDefinition.parse(new URLSearchParams("ids=1,2,3")).ids).toEqual([
			1, 2, 3,
		]);
	});

	test("returns referentially equal values for the same raw input", () => {
		const first = testDefinition.parse(new URLSearchParams("ids=1&ids=2"));
		const second = testDefinition.parse(new URLSearchParams("ids=1&ids=2"));

		expect(first.ids).toBe(second.ids);
	});

	test("rejects schemas outside the derivation table at define time", () => {
		expect(() =>
			SP.param(v.object({ a: v.string() }) as any, {
				default: { a: "" },
			}),
		).toThrow(/derive/);
		expect(() =>
			SP.param(
				v.pipe(
					v.string(),
					v.transform((s) => s.length),
				) as any,
				{
					default: 0,
				},
			),
		).toThrow(/derive/);
		expect(() =>
			SP.param(v.array(v.array(v.number())) as any, {
				default: [],
			}),
		).toThrow(/derive/);
	});

	test("defaults v.nullable() params to null without declaring it", () => {
		const omitted = SP.param(v.nullable(v.pipe(v.number(), v.integer())), {
		});
		const declared = SP.param(v.nullable(v.pipe(v.number(), v.integer())), {
			default: null,
		});

		expect(omitted.default).toBeNull();
		expect(SearchParams.decodeParam(omitted, [])).toBeNull();
		expect(SearchParams.decodeParam(omitted, ["nope"])).toBeNull();
		expect(SearchParams.encodeParam(omitted, null)).toEqual([]);
		expect(declared.default).toBeNull();
	});

	test("rejects v.optional() and non-null defaults for v.nullable()", () => {
		expect(() =>
			SP.param(v.optional(v.number()) as any, { default: 1 }),
		).toThrow(/nullable/);
		expect(() =>
			SP.param(v.nullable(v.number()), { default: 1 as any }),
		).toThrow(/null as its default/);
	});

	test("supports SP.custom codecs with total decode", () => {
		const isoDate: SearchParams.ParamCodec<Date | null> = {
			decode: (value) => {
				const date = new Date(value);
				if (Number.isNaN(date.getTime())) return { ok: false };
				return { ok: true, value: date };
			},
			encode: (date) => date!.toISOString(),
		};
		const customDefinition = SearchParams.define({
			from: SP.custom(isoDate, { default: null }),
		});

		const value = new Date("2024-05-01T12:00:00.000Z");
		expect(
			customDefinition.parse(
				new URL(
					customDefinition.href("/x", { from: value }),
					"http://localhost",
				),
			).from,
		).toEqual(value);
		assertDecodesToDefault(customDefinition, "from", [["garbage"], [""]]);
	});

	test("rejects resets pointing at unknown params", () => {
		expect(() =>
			SearchParams.define({
				a: SP.param(v.number(), { default: 0, resets: ["b"] }),
			}),
		).toThrow(/unknown param/);
	});
});

describe("SearchParams compression", () => {
	test("decodes a compressed arrival of any param identically to plain", () => {
		const def = testDefinition.shape.filters;
		const value = { minValue: 7, tags: ["x"] };
		const plain = def.encodePlain(value)[0];

		expect(
			SearchParams.decodeParam(def, [
				SearchParams.compressTransportValue(plain),
			]),
		).toEqual(value);
	});

	test("always emits the compressed form for compress: true params", () => {
		const encoded = SearchParams.encodeParam(testDefinition.shape.blob, {
			text: "hello world",
		});

		expect(encoded).toHaveLength(1);
		expect(encoded[0]).toMatch(/^lz~/);
	});

	test("resolves a corrupt compressed payload to the default", () => {
		expect(
			SearchParams.decodeParam(testDefinition.shape.blob, ["lz~$$$$"]),
		).toEqual({ text: "" });
	});

	test("resolves a compression bomb to the default", () => {
		const bomb = SearchParams.compressTransportValue(
			JSON.stringify({ text: "a".repeat(10 * 1024 * 1024) }),
		);

		expect(SearchParams.decodeParam(testDefinition.shape.blob, [bomb])).toEqual(
			{ text: "" },
		);
	});

	test("compresses on demand only when it shortens the value", () => {
		const longFilters = {
			minValue: 1,
			tags: Array.from({ length: 30 }, (_, i) => `long-tag-number-${i}`),
		};
		const compactHref = testDefinition.href(
			"/x",
			{ filters: longFilters, limit: 50 },
			{ compress: true },
		);

		const searchParams = new URL(compactHref, "http://localhost").searchParams;
		expect(searchParams.get("filters")).toMatch(/^lz~/);
		expect(searchParams.get("limit")).toBe("50");
		expect(
			testDefinition.parse(new URL(compactHref, "http://localhost")),
		).toMatchObject({ filters: longFilters, limit: 50 });
	});

	test("compares the forms percent-encoded, not as raw strings", () => {
		// shorter than its compressed form as a raw string, longer once percent-encoded
		const filters = { minValue: 1, tags: ["ゲームのタグ"] };
		const compactHref = testDefinition.href(
			"/x",
			{ filters },
			{ compress: true },
		);

		const searchParams = new URL(compactHref, "http://localhost").searchParams;
		expect(searchParams.get("filters")).toMatch(/^lz~/);
		expect(compactHref.length).toBeLessThan(
			testDefinition.href("/x", { filters }).length,
		);
	});
});

describe("SearchParams.href", () => {
	test("omits values equal to their default", () => {
		expect(
			testDefinition.href("/builds", { limit: 24, mode: "SZ", season: null }),
		).toBe("/builds?mode=SZ");
		expect(testDefinition.href("/builds", { limit: 24 })).toBe("/builds");
	});

	test("encodes arrays as repeated keys and empty arrays as one empty value", () => {
		const definitionWithDefault = SearchParams.define({
			modes: SP.param(v.array(v.picklist(["SZ", "TC"])), {
				default: ["SZ", "TC"],
			}),
		});

		expect(testDefinition.href("/x", { ids: [1, 2] })).toBe("/x?ids=1&ids=2");
		expect(definitionWithDefault.href("/x", { modes: [] })).toBe("/x?modes=");
		expect(
			definitionWithDefault.parse(new URL("/x?modes=", "http://localhost"))
				.modes,
		).toEqual([]);
	});
});

describe("SearchParams.applyToSearchParams", () => {
	test("preserves params outside the definition", () => {
		const next = SearchParams.applyToSearchParams(
			testDefinition,
			new URLSearchParams("unrelated=yes&limit=50"),
			{ mode: "SZ" },
		);

		expect(next.get("unrelated")).toBe("yes");
		expect(next.get("limit")).toBe("50");
		expect(next.get("mode")).toBe("SZ");
	});

	test("applies declared resets", () => {
		const next = SearchParams.applyToSearchParams(
			testDefinition,
			new URLSearchParams("limit=50&enabled=true"),
			{ filters: { minValue: 1, tags: [] } },
		);

		expect(next.has("limit")).toBe(false);
		expect(next.get("enabled")).toBe("true");
	});

	test("does not reset a param written in the same batch", () => {
		const next = SearchParams.applyToSearchParams(
			testDefinition,
			new URLSearchParams(),
			{ limit: 50, filters: { minValue: 1, tags: ["a"] } },
		);

		expect(next.get("limit")).toBe("50");
	});

	test("removes params written back to their default", () => {
		const next = SearchParams.applyToSearchParams(
			testDefinition,
			new URLSearchParams("mode=SZ"),
			{ mode: "TW" },
		);

		expect(next.has("mode")).toBe(false);
	});
});
