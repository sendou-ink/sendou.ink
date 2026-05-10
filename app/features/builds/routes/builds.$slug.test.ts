import { describe, expect, test } from "vitest";
import { buildFiltersMeaningfullyChanged } from "./builds.$slug";

const sp = (filters?: unknown, extra: Record<string, string> = {}) => {
	const params = new URLSearchParams(extra);
	if (filters !== undefined) params.set("f", JSON.stringify(filters));
	return params;
};

const ability = (
	value: number,
	comparison: "AT_LEAST" | "AT_MOST" = "AT_LEAST",
	abilityName = "ISM",
) => ({ type: "ability", ability: abilityName, comparison, value });

const mode = (modeShort: "SZ" | "TC" | "RM" | "CB") => ({
	type: "mode",
	mode: modeShort,
});

const date = (dateString: string) => ({ type: "date", date: dateString });

describe("buildFiltersMeaningfullyChanged", () => {
	test("no filters either side -> not changed", () => {
		expect(buildFiltersMeaningfullyChanged(sp(), sp())).toBe(false);
	});

	test("identical filters in same order -> not changed", () => {
		expect(
			buildFiltersMeaningfullyChanged(
				sp([ability(10), mode("SZ")]),
				sp([ability(10), mode("SZ")]),
			),
		).toBe(false);
	});

	test("identical filters in different order -> not changed", () => {
		expect(
			buildFiltersMeaningfullyChanged(
				sp([ability(10), mode("SZ")]),
				sp([mode("SZ"), ability(10)]),
			),
		).toBe(false);
	});

	test("ability filter value differs -> changed", () => {
		expect(
			buildFiltersMeaningfullyChanged(sp([ability(10)]), sp([ability(20)])),
		).toBe(true);
	});

	test("different filter count -> changed", () => {
		expect(
			buildFiltersMeaningfullyChanged(
				sp([ability(10)]),
				sp([ability(10), mode("SZ")]),
			),
		).toBe(true);
	});

	test("duplicate ability filters with different values are not equal", () => {
		// Regression test for the subset-check bug.
		// old = [ability(5), ability(10)], new = [ability(10), ability(10)]
		// the previous implementation would incorrectly return "not changed".
		expect(
			buildFiltersMeaningfullyChanged(
				sp([ability(5), ability(10)]),
				sp([ability(10), ability(10)]),
			),
		).toBe(true);
	});

	test("AT_LEAST 0 ability filter added on the new side -> not changed", () => {
		expect(
			buildFiltersMeaningfullyChanged(
				sp([ability(10)]),
				sp([ability(10), ability(0)]),
			),
		).toBe(false);
	});

	test("both sides only have meaningless filters -> not changed", () => {
		expect(
			buildFiltersMeaningfullyChanged(sp([ability(0)]), sp([ability(0)])),
		).toBe(false);
	});

	test("mode filter changed -> changed", () => {
		expect(
			buildFiltersMeaningfullyChanged(sp([mode("SZ")]), sp([mode("TC")])),
		).toBe(true);
	});

	test("mode filter same -> not changed", () => {
		expect(
			buildFiltersMeaningfullyChanged(sp([mode("SZ")]), sp([mode("SZ")])),
		).toBe(false);
	});

	test("date filter changed -> changed", () => {
		expect(
			buildFiltersMeaningfullyChanged(
				sp([date("2026-01-01")]),
				sp([date("2026-02-01")]),
			),
		).toBe(true);
	});

	test("ability comparison flipped (AT_LEAST -> AT_MOST) -> changed", () => {
		expect(
			buildFiltersMeaningfullyChanged(
				sp([ability(10, "AT_LEAST")]),
				sp([ability(10, "AT_MOST")]),
			),
		).toBe(true);
	});

	test("old has filters, new has none -> changed", () => {
		expect(buildFiltersMeaningfullyChanged(sp([ability(10)]), sp())).toBe(true);
	});

	test("old has only meaningless filters, new has none -> not changed", () => {
		expect(buildFiltersMeaningfullyChanged(sp([ability(0)]), sp())).toBe(false);
	});

	test("malformed JSON in `f` param does not throw and is treated as empty", () => {
		const malformed = new URLSearchParams();
		malformed.set("f", "not-json");
		expect(buildFiltersMeaningfullyChanged(malformed, sp())).toBe(false);
		expect(buildFiltersMeaningfullyChanged(sp([ability(10)]), malformed)).toBe(
			true,
		);
	});

	test("mixed filter types in different orders -> not changed", () => {
		expect(
			buildFiltersMeaningfullyChanged(
				sp([ability(10), mode("SZ"), date("2026-01-01")]),
				sp([date("2026-01-01"), ability(10), mode("SZ")]),
			),
		).toBe(false);
	});
});
