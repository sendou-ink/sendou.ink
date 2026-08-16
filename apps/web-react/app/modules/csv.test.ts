import { describe, expect, test } from "vitest";
import * as CSV from "./csv";

describe("CSV.serialize", () => {
	test("joins cells with commas and rows with CRLF", () => {
		expect(
			CSV.serialize([
				["a", "b"],
				["c", "d"],
			]),
		).toBe("a,b\r\nc,d");
	});

	test("quotes cells containing the delimiter", () => {
		expect(CSV.serialize([["a,b", "c"]])).toBe('"a,b",c');
	});

	test("escapes quotes by doubling them", () => {
		expect(CSV.serialize([['say "hi"']])).toBe('"say ""hi"""');
	});

	test("quotes cells containing line breaks", () => {
		expect(CSV.serialize([["line1\nline2"]])).toBe('"line1\nline2"');
		expect(CSV.serialize([["line1\rline2"]])).toBe('"line1\rline2"');
	});

	test("leaves plain cells unquoted", () => {
		expect(CSV.serialize([["plain", "text"]])).toBe("plain,text");
	});

	test("handles empty input", () => {
		expect(CSV.serialize([])).toBe("");
	});

	test("neutralizes formula injection by prefixing a quote", () => {
		expect(CSV.serialize([["=1+1"]])).toBe("'=1+1");
		expect(CSV.serialize([["+1"]])).toBe("'+1");
		expect(CSV.serialize([["@SUM(A1)"]])).toBe("'@SUM(A1)");
		expect(CSV.serialize([["=HYPERLINK(1,2)"]])).toBe('"\'=HYPERLINK(1,2)"');
	});

	test("does not treat negative numbers as formulas", () => {
		expect(CSV.serialize([["-5"]])).toBe("-5");
		expect(CSV.serialize([["-5.5"]])).toBe("-5.5");
	});

	test("guards a leading minus that is not numeric", () => {
		expect(CSV.serialize([["-cmd"]])).toBe("'-cmd");
	});
});
