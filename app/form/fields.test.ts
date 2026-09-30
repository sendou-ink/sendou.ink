import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { textField, textFieldOptional } from "./fields";

describe("textField", () => {
	const urlSchema = textField({ validate: "url", maxLength: 30 });

	test.each([
		["https://sendou.ink", true, "https URL"],
		["http://sendou.ink", true, "http URL"],
		["javascript:alert(1)", false, "javascript URL"],
		["JavaScript:alert(1)", false, "javascript URL with mixed case protocol"],
		["data:text/html,<script>alert(1)</script>", false, "data URL"],
		["not a url", false, "not a URL at all"],
		["https://sendou.ink/aaaaaaaaaaaaaaaaaaaaaa", false, "URL over maxLength"],
	])("%s -> %s (%s)", (input, expected) => {
		expect(v.safeParse(urlSchema, input).success).toBe(expected);
	});
});

describe("textFieldOptional", () => {
	const urlSchema = textFieldOptional({ validate: "url", maxLength: 30 });

	test.each([
		["https://sendou.ink", true, "https URL"],
		["javascript:alert(1)", false, "javascript URL"],
		["https://sendou.ink/aaaaaaaaaaaaaaaaaaaaaa", false, "URL over maxLength"],
	])("%s -> %s (%s)", (input, expected) => {
		expect(v.safeParse(urlSchema, input).success).toBe(expected);
	});

	test.each([
		{ input: "", why: "empty string" },
		{ input: undefined, why: "missing value" },
	])("parses to null ($why)", ({ input }) => {
		expect(v.parse(urlSchema, input)).toBeNull();
	});
});
