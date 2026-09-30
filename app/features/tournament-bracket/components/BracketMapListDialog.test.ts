import { describe, expect, test } from "vitest";
import { mapSearchFilter } from "./BracketMapListDialog";

const contains = (string: string, substring: string) =>
	string.toLowerCase().includes(substring.toLowerCase());

const filter = (textValue: string, inputValue: string) =>
	mapSearchFilter(textValue, inputValue, contains);

describe("mapSearchFilter", () => {
	test("matches everything for empty input", () => {
		expect(filter("SZ Hagglefish Market", "")).toBe(true);
		expect(filter("TC Crableg Capital", "   ")).toBe(true);
	});

	test("matches against stage name when no mode prefix is given", () => {
		expect(filter("SZ Crableg Capital", "crab")).toBe(true);
		expect(filter("TC Crableg Capital", "crab")).toBe(true);
		expect(filter("SZ Hagglefish Market", "crab")).toBe(false);
	});

	test("mode prefix alone matches all maps of that mode", () => {
		expect(filter("SZ Hagglefish Market", "sz")).toBe(true);
		expect(filter("SZ Crableg Capital", "sz")).toBe(true);
		expect(filter("TC Crableg Capital", "sz")).toBe(false);
	});

	test("mode prefix is case-insensitive", () => {
		expect(filter("SZ Hagglefish Market", "Sz")).toBe(true);
		expect(filter("SZ Hagglefish Market", "SZ")).toBe(true);
	});

	test("trailing whitespace after a mode prefix still matches all of that mode", () => {
		expect(filter("SZ Hagglefish Market", "sz ")).toBe(true);
		expect(filter("TC Hagglefish Market", "sz ")).toBe(false);
	});

	test("mode prefix combined with a query filters within that mode", () => {
		expect(filter("SZ Crableg Capital", "sz crab")).toBe(true);
		expect(filter("SZ Hagglefish Market", "sz crab")).toBe(false);
		expect(filter("TC Crableg Capital", "sz crab")).toBe(false);
	});

	test("query after mode prefix is matched against the stage name", () => {
		expect(filter("RM Museum d'Alfonsino", "rm museum")).toBe(true);
		expect(filter("RM Museum d'Alfonsino", "rm market")).toBe(false);
	});

	test("non-mode first word falls back to stage name search", () => {
		expect(filter("SZ Hagglefish Market", "hagg")).toBe(true);
		expect(filter("SZ Hagglefish Market", "market")).toBe(true);
	});
});
