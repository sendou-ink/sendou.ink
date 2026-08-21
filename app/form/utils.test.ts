import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { preprocess } from "~/utils/schema";
import { getNestedSchema, getNestedValue, setNestedValue } from "./utils";

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
