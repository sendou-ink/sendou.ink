import { describe, expect, test } from "vitest";
import { datePlaceholder, resolveDatePlaceholders } from "./chat-utils";

describe("datePlaceholder", () => {
	test("returns correctly formatted placeholder string", () => {
		const date = new Date(1700000000000);

		expect(datePlaceholder(date)).toBe("{{date:1700000000000}}");
	});
});

describe("resolveDatePlaceholders", () => {
	const mockFormat = (d: Date) => `FORMATTED:${d.getTime()}`;

	test("replaces a single placeholder with formatted date", () => {
		const text = "Starts at {{date:1700000000000}}";

		expect(resolveDatePlaceholders(text, mockFormat)).toBe(
			"Starts at FORMATTED:1700000000000",
		);
	});

	test("replaces multiple placeholders in one string", () => {
		const text = "From {{date:1700000000000}} to {{date:1700003600000}}";

		expect(resolveDatePlaceholders(text, mockFormat)).toBe(
			"From FORMATTED:1700000000000 to FORMATTED:1700003600000",
		);
	});

	test("returns text unchanged when no placeholders present", () => {
		const text = "Just a normal string";

		expect(resolveDatePlaceholders(text, mockFormat)).toBe(text);
	});

	test("handles text that is only a placeholder", () => {
		const text = "{{date:1700000000000}}";

		expect(resolveDatePlaceholders(text, mockFormat)).toBe(
			"FORMATTED:1700000000000",
		);
	});
});
