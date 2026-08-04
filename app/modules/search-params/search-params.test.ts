import type { ShouldRevalidateFunction } from "react-router";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as SearchParams from "./search-params";
import { SP } from "./search-params";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "./search-params-test-utils";

const testDefinition = SearchParams.define({
	limit: SP.param(z.number().int().min(1).max(100), {
		default: 24,
		loader: true,
	}),
	name: SP.param(z.string().max(20), { default: "", loader: true }),
	enabled: SP.param(z.boolean(), { default: false, loader: false }),
	mode: SP.param(z.enum(["TW", "SZ", "TC"]), {
		default: "TW",
		loader: true,
	}),
	season: SP.param(z.number().int().nullable(), { loader: true }),
	ids: SP.param(z.array(z.number().int().positive()), {
		default: [],
		loader: false,
	}),
	filters: SP.json(
		z.object({ minValue: z.number(), tags: z.array(z.string()) }),
		{ default: { minValue: 0, tags: [] }, loader: true, resets: ["limit"] },
	),
	blob: SP.json(z.object({ text: z.string() }), {
		default: { text: "" },
		loader: false,
		compress: true,
	}),
});

describe("SearchParams round trips", () => {
	it("round-trips representative and edge-case values", () => {
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
	it("decodes garbage to the default", () => {
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

	it("parses a Request, URL and URLSearchParams", () => {
		const url = "http://localhost/builds?limit=50&mode=SZ";
		const expected = { limit: 50, mode: "SZ" };

		expect(testDefinition.parse(new Request(url))).toMatchObject(expected);
		expect(testDefinition.parse(new URL(url))).toMatchObject(expected);
		expect(
			testDefinition.parse(new URLSearchParams("limit=50&mode=SZ")),
		).toMatchObject(expected);
	});

	it("resolves every missing param to its default", () => {
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

	it("drops invalid array members instead of the whole array", () => {
		expect(
			testDefinition.parse(new URLSearchParams("ids=1&ids=x&ids=-2&ids=3")).ids,
		).toEqual([1, 3]);
	});

	it("decodes legacy JSON-encoded arrays", () => {
		const definitionWithModes = SearchParams.define({
			modes: SP.param(z.array(z.enum(["SZ", "TC", "RM", "CB"])), {
				default: ["SZ", "TC", "RM", "CB"],
				loader: false,
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

	it("decodes legacy comma-joined numeric arrays", () => {
		expect(testDefinition.parse(new URLSearchParams("ids=1,2,3")).ids).toEqual([
			1, 2, 3,
		]);
	});

	it("returns referentially equal values for the same raw input", () => {
		const first = testDefinition.parse(new URLSearchParams("ids=1&ids=2"));
		const second = testDefinition.parse(new URLSearchParams("ids=1&ids=2"));

		expect(first.ids).toBe(second.ids);
	});

	it("rejects schemas outside the derivation table at define time", () => {
		expect(() =>
			SP.param(z.object({ a: z.string() }) as any, {
				default: { a: "" },
				loader: true,
			}),
		).toThrow(/derive/);
		expect(() =>
			SP.param(z.string().transform((s) => s.length) as any, {
				default: 0,
				loader: true,
			}),
		).toThrow(/derive/);
		expect(() =>
			SP.param(z.array(z.array(z.number())) as any, {
				default: [],
				loader: true,
			}),
		).toThrow(/derive/);
	});

	it("defaults .nullable() params to null without declaring it", () => {
		const omitted = SP.param(z.number().int().nullable(), { loader: true });
		const declared = SP.param(z.number().int().nullable(), {
			default: null,
			loader: true,
		});

		expect(omitted.default).toBeNull();
		expect(SearchParams.decodeParam(omitted, [])).toBeNull();
		expect(SearchParams.decodeParam(omitted, ["nope"])).toBeNull();
		expect(SearchParams.encodeParam(omitted, null)).toEqual([]);
		expect(declared.default).toBeNull();
	});

	it("rejects .optional() and non-null defaults for .nullable()", () => {
		expect(() =>
			SP.param(z.number().optional() as any, { default: 1, loader: true }),
		).toThrow(/nullable/);
		expect(() =>
			SP.param(z.number().nullable(), { default: 1 as any, loader: true }),
		).toThrow(/null as its default/);
	});

	it("supports SP.custom codecs with total decode via issues", () => {
		const isoDate = z.codec(z.string(), z.date(), {
			decode: (value, payload) => {
				const date = new Date(value);
				if (Number.isNaN(date.getTime())) {
					payload.issues.push({
						code: "custom",
						message: "invalid date",
						input: value,
					});
					return z.NEVER;
				}
				return date;
			},
			encode: (date) => date.toISOString(),
		});
		const customDefinition = SearchParams.define({
			from: SP.custom(isoDate.nullable(), { default: null, loader: true }),
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

	it("rejects resets pointing at unknown params", () => {
		expect(() =>
			SearchParams.define({
				a: SP.param(z.number(), { default: 0, loader: true, resets: ["b"] }),
			}),
		).toThrow(/unknown param/);
	});
});

describe("SearchParams compression", () => {
	it("decodes a compressed arrival of any param identically to plain", () => {
		const def = testDefinition.shape.filters;
		const value = { minValue: 7, tags: ["x"] };
		const plain = def.encodePlain(value)[0];

		expect(
			SearchParams.decodeParam(def, [
				SearchParams.compressTransportValue(plain),
			]),
		).toEqual(value);
	});

	it("always emits the compressed form for compress: true params", () => {
		const encoded = SearchParams.encodeParam(testDefinition.shape.blob, {
			text: "hello world",
		});

		expect(encoded).toHaveLength(1);
		expect(encoded[0]).toMatch(/^lz~/);
	});

	it("resolves a corrupt compressed payload to the default", () => {
		expect(
			SearchParams.decodeParam(testDefinition.shape.blob, ["lz~$$$$"]),
		).toEqual({ text: "" });
	});

	it("resolves a compression bomb to the default", () => {
		const bomb = SearchParams.compressTransportValue(
			JSON.stringify({ text: "a".repeat(10 * 1024 * 1024) }),
		);

		expect(SearchParams.decodeParam(testDefinition.shape.blob, [bomb])).toEqual(
			{ text: "" },
		);
	});

	it("compresses on demand only when it shortens the value", () => {
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

	it("compares the forms percent-encoded, not as raw strings", () => {
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
	it("omits values equal to their default", () => {
		expect(
			testDefinition.href("/builds", { limit: 24, mode: "SZ", season: null }),
		).toBe("/builds?mode=SZ");
		expect(testDefinition.href("/builds", { limit: 24 })).toBe("/builds");
	});

	it("encodes arrays as repeated keys and empty arrays as one empty value", () => {
		const definitionWithDefault = SearchParams.define({
			modes: SP.param(z.array(z.enum(["SZ", "TC"])), {
				default: ["SZ", "TC"],
				loader: false,
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
	it("preserves params outside the definition", () => {
		const { next } = SearchParams.applyToSearchParams(
			testDefinition,
			new URLSearchParams("unrelated=yes&limit=50"),
			{ mode: "SZ" },
		);

		expect(next.get("unrelated")).toBe("yes");
		expect(next.get("limit")).toBe("50");
		expect(next.get("mode")).toBe("SZ");
	});

	it("applies declared resets", () => {
		const { next } = SearchParams.applyToSearchParams(
			testDefinition,
			new URLSearchParams("limit=50&enabled=true"),
			{ filters: { minValue: 1, tags: [] } },
		);

		expect(next.has("limit")).toBe(false);
		expect(next.get("enabled")).toBe("true");
	});

	it("does not reset a param written in the same batch", () => {
		const { next } = SearchParams.applyToSearchParams(
			testDefinition,
			new URLSearchParams(),
			{ limit: 50, filters: { minValue: 1, tags: ["a"] } },
		);

		expect(next.get("limit")).toBe("50");
	});

	it("removes params written back to their default", () => {
		const { next } = SearchParams.applyToSearchParams(
			testDefinition,
			new URLSearchParams("mode=SZ"),
			{ mode: "TW" },
		);

		expect(next.has("mode")).toBe(false);
	});

	it("needs navigation exactly when a loader: true param is written", () => {
		expect(
			SearchParams.applyToSearchParams(testDefinition, new URLSearchParams(), {
				enabled: true,
				ids: [1],
			}).navigationNeeded,
		).toBe(false);
		expect(
			SearchParams.applyToSearchParams(testDefinition, new URLSearchParams(), {
				enabled: true,
				mode: "SZ",
			}).navigationNeeded,
		).toBe(true);
	});
});

describe("SearchParams.shouldRevalidate", () => {
	function run(
		currentSearch: string,
		nextSearch: string,
		overrides?: Partial<Parameters<ShouldRevalidateFunction>[0]>,
	) {
		return testDefinition.shouldRevalidate({
			currentUrl: new URL(`http://localhost/x${currentSearch}`),
			nextUrl: new URL(`http://localhost/x${nextSearch}`),
			currentParams: {},
			nextParams: {},
			defaultShouldRevalidate: true,
			...overrides,
		} as Parameters<ShouldRevalidateFunction>[0]);
	}

	it("revalidates when a loader: true param's decoded value changes", () => {
		expect(run("?limit=50", "?limit=60")).toBe(true);
		expect(run("", "?mode=SZ")).toBe(true);
	});

	it("does not revalidate for loader: false params", () => {
		expect(run("", "?enabled=true&ids=1")).toBe(false);
	});

	it("does not revalidate for non-canonical but equal values", () => {
		expect(
			run(
				'?filters={"minValue":1,"tags":[]}',
				'?filters={"tags":[],"minValue":1}',
			),
		).toBe(false);
		expect(run("?limit=24", "")).toBe(false);
	});

	it("defers to the default for other pathnames, submissions and unknown params", () => {
		expect(
			testDefinition.shouldRevalidate({
				currentUrl: new URL("http://localhost/x"),
				nextUrl: new URL("http://localhost/y"),
				currentParams: {},
				nextParams: {},
				defaultShouldRevalidate: true,
			} as Parameters<ShouldRevalidateFunction>[0]),
		).toBe(true);
		expect(run("", "", { formMethod: "POST" })).toBe(true);
		expect(run("?unrelated=1", "?unrelated=2")).toBe(true);
	});
});
