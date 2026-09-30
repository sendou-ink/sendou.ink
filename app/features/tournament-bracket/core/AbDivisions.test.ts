import { describe, expect, test } from "vitest";
import { unwrap, unwrapErr } from "~/utils/result";
import * as AbDivisions from "./AbDivisions";

describe("AbDivisions.validate", () => {
	test("accepts a balanced 12-team single-group configuration", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
			groupCount: 1,
		});

		expect(result.ok).toBe(true);
		expect(unwrap(result)).toEqual([0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
	});

	test("accepts a balanced 12-team two-group configuration", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
			groupCount: 2,
		});

		expect(result.ok).toBe(true);
	});

	test("rejects any unassigned team", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 1, 0, 1, 0, null, 0, 1, 0, 1, 0, 1],
			groupCount: 1,
		});

		expect(result.ok).toBe(false);
		expect(unwrapErr(result)).toMatch(/assigned/);
	});

	test("rejects invalid division values", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1],
			groupCount: 1,
		});

		expect(result.ok).toBe(false);
	});

	test("rejects A/B counts differing by more than 1", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
			groupCount: 1,
		});

		expect(result.ok).toBe(false);
		expect(unwrapErr(result)).toMatch(/7 A, 5 B/);
	});

	test("accepts a ±1 uneven configuration with a single group", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
			groupCount: 1,
		});

		expect(result.ok).toBe(true);
	});

	test("rejects a ±1 uneven configuration when there are multiple groups", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
			groupCount: 2,
		});

		expect(result.ok).toBe(false);
		expect(unwrapErr(result)).toMatch(/single group/);
	});

	test("rejects team counts not divisible by group count", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
			groupCount: 3,
		});

		expect(result.ok).toBe(false);
		expect(unwrapErr(result)).toMatch(/10 checked-in teams into 3/);
	});

	test("rejects odd per-group team counts", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
			groupCount: 2,
		});

		expect(result.ok).toBe(false);
		expect(unwrapErr(result)).toMatch(/5 teams/);
	});

	test("preserves the original order of the divisions", () => {
		const divisions = [1, 0, 1, 0, 0, 1, 1, 0];

		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: divisions,
			groupCount: 2,
		});

		expect(unwrap(result)).toEqual(divisions);
	});
});

describe("AbDivisions.countByDivision", () => {
	test("counts A, B, and unassigned separately", () => {
		const counts = AbDivisions.countByDivision([
			{ abDivision: 0 },
			{ abDivision: 0 },
			{ abDivision: 1 },
			{ abDivision: null },
			{ abDivision: null },
			{ abDivision: null },
		]);

		expect(counts).toEqual({ a: 2, b: 1, unassigned: 3 });
	});
});
