import { describe, expect, test } from "vitest";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { archiveVideoCheckAfter, parseTwitchDuration } from "./vods";

describe("parseTwitchDuration()", () => {
	test("parses hours, minutes and seconds", () => {
		expect(parseTwitchDuration("1h2m3s")).toBe(3723);
	});

	test("parses hours only", () => {
		expect(parseTwitchDuration("2h")).toBe(7200);
	});

	test("parses minutes only", () => {
		expect(parseTwitchDuration("45m")).toBe(2700);
	});

	test("parses seconds only", () => {
		expect(parseTwitchDuration("30s")).toBe(30);
	});

	test("parses hours and minutes without seconds", () => {
		expect(parseTwitchDuration("1h30m")).toBe(5400);
	});

	test("parses hours and seconds without minutes", () => {
		expect(parseTwitchDuration("2h15s")).toBe(7215);
	});

	test("parses minutes and seconds without hours", () => {
		expect(parseTwitchDuration("5m10s")).toBe(310);
	});

	test("returns 0 for empty string", () => {
		expect(parseTwitchDuration("")).toBe(0);
	});

	test("parses large values", () => {
		expect(parseTwitchDuration("99h59m59s")).toBe(359999);
	});
});

describe("archiveVideoCheckAfter()", () => {
	const createdAt = new Date("2026-11-01T12:00:00Z");

	test.each([
		{
			why: "partner",
			broadcasterType: "partner",
			expected: "2026-12-31T12:00:00Z",
		},
		{
			why: "affiliate",
			broadcasterType: "affiliate",
			expected: "2026-11-15T12:00:00Z",
		},
		{
			why: "regular user",
			broadcasterType: "",
			expected: "2026-11-08T12:00:00Z",
		},
	])("$why -> $expected", ({ broadcasterType, expected }) => {
		expect(archiveVideoCheckAfter({ createdAt, broadcasterType })).toBe(
			dateToDatabaseTimestamp(new Date(expected)),
		);
	});
});
