import { describe, expect, it } from "vitest";
import * as AbDivisions from "./AbDivisions";

describe("AbDivisions.validate", () => {
	it("accepts a balanced 12-team single-group configuration", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
			groupCount: 1,
		});

		expect(result.isOk()).toBe(true);
		expect(result._unsafeUnwrap()).toEqual([
			0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
		]);
	});

	it("accepts a balanced 12-team two-group configuration", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
			groupCount: 2,
		});

		expect(result.isOk()).toBe(true);
	});

	it("rejects any unassigned team", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 1, 0, 1, 0, null, 0, 1, 0, 1, 0, 1],
			groupCount: 1,
		});

		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr()).toMatch(/assigned/);
	});

	it("rejects invalid division values", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1],
			groupCount: 1,
		});

		expect(result.isErr()).toBe(true);
	});

	it("rejects A/B counts differing by more than 1", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
			groupCount: 1,
		});

		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr()).toMatch(/7 A, 5 B/);
	});

	it("accepts a ±1 uneven configuration with a single group", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
			groupCount: 1,
		});

		expect(result.isOk()).toBe(true);
	});

	it("rejects a ±1 uneven configuration when there are multiple groups", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
			groupCount: 2,
		});

		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr()).toMatch(/single group/);
	});

	it("rejects team counts not divisible by group count", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
			groupCount: 3,
		});

		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr()).toMatch(/10 checked-in teams into 3/);
	});

	it("rejects odd per-group team counts", () => {
		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
			groupCount: 2,
		});

		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr()).toMatch(/5 teams/);
	});

	it("preserves the original order of the divisions", () => {
		const divisions = [1, 0, 1, 0, 0, 1, 1, 0];

		const result = AbDivisions.validate({
			abDivisionsBySeedOrder: divisions,
			groupCount: 2,
		});

		expect(result._unsafeUnwrap()).toEqual(divisions);
	});
});

describe("AbDivisions.countByDivision", () => {
	it("counts A, B, and unassigned separately", () => {
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
