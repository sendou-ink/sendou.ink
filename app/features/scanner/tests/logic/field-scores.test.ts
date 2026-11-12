import { describe, expect, test } from "vitest";
import * as FieldScores from "../../core/field-scores";

const BOARD = {
	mode: "SZ",
	stage: 3,
	players: [
		{ name: "a", paint: 900 },
		{ name: "b", paint: null },
	],
};

describe("FieldScores.of", () => {
	test("leaves out the fields a read did not score", () => {
		expect(
			FieldScores.of({ mode: 0.9, stage: null, lobby: undefined }),
		).toEqual({ mode: 0.9 });
	});

	test("rounds to four decimals and floors negatives at 0", () => {
		expect(FieldScores.of({ name: 0.81236, weaponId: -0.2 })).toEqual({
			name: 0.8124,
			weaponId: 0,
		});
	});
});

describe("FieldScores.under", () => {
	test("puts every field of a unit under the prefix", () => {
		expect(
			FieldScores.under("players.3", { name: 0.8, "special,dead": 0.7 }),
		).toEqual({
			"players.3.name": 0.8,
			"players.3.special,players.3.dead": 0.7,
		});
	});
});

describe("FieldScores.mean", () => {
	test.each<{
		why: string;
		scores: FieldScores.FieldScores;
		expected: number;
	}>([
		{ why: "averages the scores", scores: { a: 0.5, b: 1 }, expected: 0.75 },
		{ why: "is 0 for a read that scored nothing", scores: {}, expected: 0 },
	])("$why", ({ scores, expected }) => {
		expect(FieldScores.mean(scores)).toBe(expected);
	});
});

describe("FieldScores.reach", () => {
	test.each([
		{
			why: "holds at the floor",
			fields: ["a", "b"],
			floor: 0.7,
			expected: true,
		},
		{
			why: "fails under the floor",
			fields: ["a", "b"],
			floor: 0.8,
			expected: false,
		},
		{
			why: "fails for an unscored field",
			fields: ["a", "c"],
			floor: 0,
			expected: false,
		},
	])("$why", ({ fields, floor, expected }) => {
		expect(FieldScores.reach({ a: 0.9, b: 0.7 }, fields, floor)).toBe(expected);
	});
});

describe("FieldScores.valueAt", () => {
	test.each([
		{ why: "reads a top-level field", field: "stage", expected: 3 },
		{ why: "reads through a list", field: "players.1.name", expected: "b" },
		{
			why: "reads a unit as the list of its fields",
			field: "mode,stage",
			expected: ["SZ", 3],
		},
		{
			why: "is undefined where the path leads nowhere",
			field: "players.5.name",
			expected: undefined,
		},
	])("$why", ({ field, expected }) => {
		expect(FieldScores.valueAt(BOARD, field)).toEqual(expected);
	});
});

describe("FieldScores.withValueAt", () => {
	test("replaces a nested value, copying only along its path", () => {
		const changed = FieldScores.withValueAt(BOARD, "players.1.name", "c");

		expect(changed.players[1]).toEqual({ name: "c", paint: null });
		expect(changed.players[0]).toBe(BOARD.players[0]);
		expect(BOARD.players[1]!.name).toBe("b");
	});

	test("replaces every field of a unit", () => {
		expect(
			FieldScores.withValueAt(BOARD, "mode,stage", ["TC", 7]),
		).toMatchObject({ mode: "TC", stage: 7 });
	});

	test("returns the data itself where the path leads nowhere", () => {
		expect(FieldScores.withValueAt(BOARD, "players.5.name", "c")).toBe(BOARD);
	});

	test("returns the data itself when the value is the one it holds", () => {
		expect(FieldScores.withValueAt(BOARD, "stage", 3)).toBe(BOARD);
	});
});

describe("FieldScores.isRead", () => {
	test.each([
		{ why: "a number", value: 0, expected: true },
		{ why: "a name", value: "a", expected: true },
		{ why: "a unit with one field read", value: ["SZ", null], expected: true },
		{ why: "null", value: null, expected: false },
		{ why: "a missing value", value: undefined, expected: false },
		{ why: "an empty name", value: "", expected: false },
		{ why: "a unit with no field read", value: [null, null], expected: false },
	])("$why: $expected", ({ value, expected }) => {
		expect(FieldScores.isRead(value)).toBe(expected);
	});
});
