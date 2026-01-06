import { describe, expect, test } from "vitest";
import { z } from "zod";
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
		const schema = z.object({ name: z.string() });
		const result = getNestedSchema(schema, "name");
		expect(result).toBeInstanceOf(z.ZodString);
	});

	test("returns schema for nested path", () => {
		const schema = z.object({ config: z.object({ name: z.string() }) });
		const result = getNestedSchema(schema, "config.name");
		expect(result).toBeInstanceOf(z.ZodString);
	});

	test("unwraps nullable wrapper", () => {
		const schema = z.object({
			config: z.object({ name: z.string() }).nullable(),
		});
		const result = getNestedSchema(schema, "config.name");
		const def = result?._def ?? (result as unknown as { def?: unknown })?.def;
		const typeName =
			(def as { typeName?: string })?.typeName ??
			(def as { type?: string })?.type;
		expect(typeName).toBe("string");
	});

	test("unwraps optional wrapper", () => {
		const schema = z.object({
			config: z.object({ name: z.string() }).optional(),
		});
		const result = getNestedSchema(schema, "config.name");
		const def = result?._def ?? (result as unknown as { def?: unknown })?.def;
		const typeName =
			(def as { typeName?: string })?.typeName ??
			(def as { type?: string })?.type;
		expect(typeName).toBe("string");
	});

	test("returns undefined for invalid path", () => {
		const schema = z.object({ name: z.string() });
		expect(getNestedSchema(schema, "missing.path")).toBe(undefined);
	});

	test("returns undefined when path goes through non-object", () => {
		const schema = z.object({ name: z.string() });
		expect(getNestedSchema(schema, "name.invalid")).toBe(undefined);
	});
});
