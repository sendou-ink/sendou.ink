import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { preprocess } from "~/utils/schema";
import {
	array,
	datetimeOptional,
	fieldset,
	textField,
	textFieldOptional,
} from "./fields";
import {
	getNestedSchema,
	getNestedValue,
	instantsToWallClocks,
	resolveFormTimeZone,
	setNestedValue,
	validateField,
	wallClocksToInstants,
} from "./utils";

describe("getNestedValue", () => {
	test("returns value at simple path", () => {
		expect(getNestedValue({ name: "test" }, "name")).toBe("test");
	});

	test("returns value at nested path", () => {
		expect(getNestedValue({ config: { name: "test" } }, "config.name")).toBe(
			"test",
		);
	});

	test("returns undefined for missing path", () => {
		expect(getNestedValue({ config: {} }, "config.name")).toBe(undefined);
	});

	test("returns undefined when parent is null", () => {
		expect(getNestedValue({ config: null }, "config.name")).toBe(undefined);
	});

	test("handles deeply nested paths", () => {
		const obj = { a: { b: { c: { d: "deep" } } } };
		expect(getNestedValue(obj, "a.b.c.d")).toBe("deep");
	});
});

describe("setNestedValue", () => {
	test("sets value at simple path", () => {
		expect(setNestedValue({}, "name", "test")).toEqual({ name: "test" });
	});

	test("sets value at nested path", () => {
		expect(setNestedValue({}, "config.name", "test")).toEqual({
			config: { name: "test" },
		});
	});

	test("preserves existing sibling values", () => {
		const obj = { config: { existing: "keep" } };
		expect(setNestedValue(obj, "config.name", "test")).toEqual({
			config: { existing: "keep", name: "test" },
		});
	});

	test("is immutable - does not modify original", () => {
		const obj = { config: { name: "old" } };
		setNestedValue(obj, "config.name", "new");
		expect(obj.config.name).toBe("old");
	});

	test("handles deeply nested paths", () => {
		expect(setNestedValue({}, "a.b.c.d", "deep")).toEqual({
			a: { b: { c: { d: "deep" } } },
		});
	});
});

describe("getNestedSchema", () => {
	test("returns schema for simple path", () => {
		const schema = v.object({ name: v.string() });
		const result = getNestedSchema(schema, "name");
		expect(result?.type).toBe("string");
	});

	test("returns schema for nested path", () => {
		const schema = v.object({ config: v.object({ name: v.string() }) });
		const result = getNestedSchema(schema, "config.name");
		expect(result?.type).toBe("string");
	});

	test("unwraps nullable wrapper", () => {
		const schema = v.object({
			config: v.nullable(v.object({ name: v.string() })),
		});
		const result = getNestedSchema(schema, "config.name");
		expect(result?.type).toBe("string");
	});

	test("unwraps optional wrapper", () => {
		const schema = v.object({
			config: v.optional(v.object({ name: v.string() })),
		});
		const result = getNestedSchema(schema, "config.name");
		expect(result?.type).toBe("string");
	});

	test("returns undefined for invalid path", () => {
		const schema = v.object({ name: v.string() });
		expect(getNestedSchema(schema, "missing.path")).toBe(undefined);
	});

	test("returns undefined when path goes through non-object", () => {
		const schema = v.object({ name: v.string() });
		expect(getNestedSchema(schema, "name.invalid")).toBe(undefined);
	});

	test("returns schema for array element path", () => {
		const schema = v.object({
			items: v.array(v.object({ name: v.string() })),
		});
		const result = getNestedSchema(schema, "items[0].name");
		expect(result?.type).toBe("string");
	});

	test("returns schema for array element path with min/max", () => {
		const schema = v.object({
			items: v.pipe(
				v.array(v.object({ name: v.string() })),
				v.minLength(1),
				v.maxLength(10),
			),
		});
		const result = getNestedSchema(schema, "items[0].name");
		expect(result?.type).toBe("string");
	});

	test("drills through a preprocess pipe into a nested object", () => {
		const schema = v.object({
			config: preprocess((val) => val, v.object({ name: v.string() })),
		});
		const result = getNestedSchema(schema, "config.name");
		expect(result?.type).toBe("string");
	});

	test("drills through a preprocess pipe into a nested array", () => {
		const schema = v.object({
			items: preprocess((val) => val, v.array(v.object({ name: v.string() }))),
		});
		const result = getNestedSchema(schema, "items[0].name");
		expect(result?.type).toBe("string");
	});

	test("drills through a preprocess pipe inside an array item", () => {
		const schema = v.object({
			items: v.array(preprocess((val) => val, v.object({ name: v.string() }))),
		});
		const result = getNestedSchema(schema, "items[0].name");
		expect(result?.type).toBe("string");
	});

	test("drills through a preprocess pipe wrapping a validated object", () => {
		const schema = v.object({
			config: preprocess(
				(val) => val,
				v.pipe(
					v.object({ name: v.string() }),
					v.check((val) => val.name.length > 0),
				),
			),
		});
		const result = getNestedSchema(schema, "config.name");
		expect(result?.type).toBe("string");
	});
});

describe("validateField", () => {
	const linksSchema = v.object({
		links: array({
			label: "labels.urls",
			max: 10,
			field: textField({ maxLength: 150, validate: "url" }),
		}),
	});

	test.each([
		{
			why: "invalid url",
			value: "twitter.com/me",
			expected: "forms:errors.invalidUrl",
		},
		{ why: "empty", value: "", expected: "forms:errors.required" },
	])(
		"validates a row of a list of plain values ($why)",
		({ value, expected }) => {
			expect(validateField(linksSchema, "links[0]", value)).toBe(expected);
		},
	);
});

describe("resolveFormTimeZone", () => {
	test.each([
		{ why: "a zone", timeZone: "Asia/Tokyo", expected: "Asia/Tokyo" },
		{ why: "no zone", timeZone: undefined, expected: null },
		{ why: "null", timeZone: null, expected: null },
		{ why: "an empty string", timeZone: "", expected: null },
		{ why: "a function", timeZone: () => "Asia/Tokyo", expected: "Asia/Tokyo" },
		{ why: "a function returning null", timeZone: () => null, expected: null },
		{
			why: "a function returning undefined",
			timeZone: () => undefined,
			expected: null,
		},
	])("resolves $why", ({ timeZone, expected }) => {
		expect(resolveFormTimeZone(timeZone, {})).toBe(expected);
	});
});

describe("wallClocksToInstants", () => {
	// 10:00 in Chicago, whatever zone the tests run in
	const CHICAGO_TEN_AM = new Date("2026-11-20T16:00:00.000Z");
	const tenAmWallClock = () => new Date(2026, 10, 20, 10, 0);

	const schema = v.object({
		zone: textFieldOptional({ label: "labels.name", maxLength: 100 }),
		startTime: datetimeOptional({ label: "labels.startTime" }),
		bracket: fieldset({
			fields: v.object({
				startTime: datetimeOptional({ label: "labels.startTime" }),
			}),
		}),
		brackets: array({
			label: "labels.brackets",
			max: 3,
			field: fieldset({
				fields: v.object({
					startTime: datetimeOptional({ label: "labels.startTime" }),
				}),
			}),
		}),
		times: array({
			label: "labels.dates",
			max: 3,
			field: datetimeOptional({ label: "labels.startTime" }),
		}),
	});

	test("converts top-level, fieldset, array of fieldset and array datetimes", () => {
		const result = wallClocksToInstants(
			schema,
			{
				startTime: tenAmWallClock(),
				bracket: { startTime: tenAmWallClock() },
				brackets: [{ startTime: tenAmWallClock() }],
				times: [tenAmWallClock()],
			},
			"America/Chicago",
		);

		expect(result).toEqual({
			startTime: CHICAGO_TEN_AM,
			bracket: { startTime: CHICAGO_TEN_AM },
			brackets: [{ startTime: CHICAGO_TEN_AM }],
			times: [CHICAGO_TEN_AM],
		});
	});

	test.each([
		{ why: "null", value: null },
		{ why: "undefined", value: undefined },
	])("leaves an unset datetime ($why) alone", ({ value }) => {
		const result = wallClocksToInstants(
			schema,
			{ startTime: value, bracket: { startTime: value }, brackets: [{}] },
			"America/Chicago",
		);

		expect(result).toEqual({
			startTime: value,
			bracket: { startTime: value },
			brackets: [{}],
		});
	});

	test("doesn't add keys missing from the values", () => {
		const result = wallClocksToInstants(
			schema,
			{ zone: "x" },
			"America/Chicago",
		);

		expect(result).toEqual({ zone: "x" });
	});

	test.each([
		{ why: "no zone", timeZone: undefined },
		{ why: "a function returning null", timeZone: () => null },
	])("returns the values as they are with $why", ({ timeZone }) => {
		const values = { startTime: tenAmWallClock() };

		expect(wallClocksToInstants(schema, values, timeZone)).toBe(values);
	});

	test("resolves a function zone from the values", () => {
		const result = wallClocksToInstants(
			schema,
			{ zone: "America/Chicago", startTime: tenAmWallClock() },
			(values) => values.zone as string,
		);

		expect(result.startTime).toEqual(CHICAGO_TEN_AM);
	});

	test("round trips with instantsToWallClocks", () => {
		const values = {
			startTime: tenAmWallClock(),
			brackets: [{ startTime: tenAmWallClock() }],
		};

		expect(
			instantsToWallClocks(
				schema,
				wallClocksToInstants(schema, values, "Asia/Kathmandu"),
				"Asia/Kathmandu",
			),
		).toEqual(values);
	});
});
