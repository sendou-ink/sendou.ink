import * as v from "valibot";
import { afterEach, describe, expect, test } from "vitest";
import { localDateToDayMonthYear } from "~/utils/dates";
import { dayMonthYear, textField, textFieldOptional } from "./fields";

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

describe("dayMonthYear", () => {
	const schema = dayMonthYear({ label: "labels.date" });
	const originalTimezone = process.env.TZ;

	afterEach(() => {
		if (originalTimezone === undefined) {
			delete process.env.TZ;
		} else {
			process.env.TZ = originalTimezone;
		}
	});

	test.each([
		{ clientTimezone: "Europe/Helsinki", why: "client ahead of UTC" },
		{ clientTimezone: "America/New_York", why: "client behind UTC" },
		{ clientTimezone: "Pacific/Kiritimati", why: "client far ahead of UTC" },
	])("keeps the day picked on the client ($why)", ({ clientTimezone }) => {
		process.env.TZ = clientTimezone;
		const pickedOnClient = JSON.parse(
			JSON.stringify(localDateToDayMonthYear(new Date(2026, 8, 28))),
		);

		process.env.TZ = "UTC";
		const result = v.parse(schema, pickedOnClient);

		expect(result).toEqual({ day: 28, month: 8, year: 2026 });
	});
});
