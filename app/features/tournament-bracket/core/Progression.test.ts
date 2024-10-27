// validate progression
// - ends in not rr or grouped
// - no two placements to different brackets
// - no "gap" in placements
// - not too much placements relative to teams per group (RR only)
// - no two brackets with the same name
// - all brackets have names
// - no dupe names
// - no same source bracket twice in the same object
// - many starting brackets https://discord.com/channels/299182152161951744/1288567178836312194/1288567178836312194
// - startTime???

import { describe, expect, it } from "vitest";
import * as Progression from "./Progression";
import { progressions } from "./tests/test-utils";

// approximate number of teams

// standings to new bracket participants

describe("bracketsToValidationError - valid formats", () => {
	it("accepts SE", () => {
		expect(
			Progression.bracketsToValidationError(progressions.singleElimination),
		).toBeNull();
	});

	it("accepts RR->SE", () => {
		expect(
			Progression.bracketsToValidationError(
				progressions.roundRobinToSingleElimination,
			),
		).toBeNull();
	});

	it("accepts low ink", () => {
		expect(
			Progression.bracketsToValidationError(progressions.lowInk),
		).toBeNull();
	});

	it("accepts many starter brackets", () => {
		expect(
			Progression.bracketsToValidationError(progressions.manyStartBrackets),
		).toBeNull();
	});

	it("accepts swiss (one group)", () => {
		expect(
			Progression.bracketsToValidationError(progressions.swissOneGroup),
		).toBeNull();
	});
});

describe("validatedSources - PLACEMENTS_PARSE_ERROR", () => {
	const getValidatedBracketsFromPlacements = (placements: string) => {
		return Progression.validatedBrackets([
			{
				id: "1",
				name: "Bracket 1",
				type: "round_robin",
				settings: {},
				requiresCheckIn: false,
			},
			{
				id: "2",
				name: "Bracket 2",
				type: "single_elimination",
				settings: {},
				requiresCheckIn: false,
				sources: [
					{
						bracketId: "1",
						placements,
					},
				],
			},
		]);
	};

	it("parses placements correctly (separated by comma)", () => {
		const result = getValidatedBracketsFromPlacements(
			"1,2,3,4",
		) as Progression.ParsedBracket[];

		expect(result[1].sources).toEqual([
			{ bracketIdx: 0, placements: [1, 2, 3, 4] },
		]);
	});

	it("parses placements correctly (separated by line)", () => {
		const result = getValidatedBracketsFromPlacements(
			"1-4",
		) as Progression.ParsedBracket[];

		expect(result[1].sources).toEqual([
			{ bracketIdx: 0, placements: [1, 2, 3, 4] },
		]);
	});

	it("parses placements correctly (separated by a mix)", () => {
		const result = getValidatedBracketsFromPlacements(
			"1,2,3-4",
		) as Progression.ParsedBracket[];

		expect(result[1].sources).toEqual([
			{ bracketIdx: 0, placements: [1, 2, 3, 4] },
		]);
	});

	it("handles placement where ranges start and end is the same", () => {
		const result = getValidatedBracketsFromPlacements(
			"1-1",
		) as Progression.ParsedBracket[];

		expect(result[1].sources).toEqual([{ bracketIdx: 0, placements: [1] }]);
	});

	it("handles parsing with extra white space", () => {
		const result = getValidatedBracketsFromPlacements(
			"1, 2, 3,4 ",
		) as Progression.ParsedBracket[];

		expect(result[1].sources).toEqual([
			{ bracketIdx: 0, placements: [1, 2, 3, 4] },
		]);
	});

	it("parsing fails if invalid characters", () => {
		const error = getValidatedBracketsFromPlacements(
			"1st,2nd,3rd,4th",
		) as Progression.ValidationError;

		expect(error.type).toBe("PLACEMENTS_PARSE_ERROR");
	});
});

const getValidatedBrackets = (
	brackets: Omit<Progression.InputBracket, "id" | "name" | "requiresCheckIn">[],
) =>
	Progression.validatedBrackets(
		brackets.map((b, i) => ({
			id: String(i),
			name: `Bracket ${i + 1}`,
			requiresCheckIn: false,
			...b,
		})),
	);

describe("validatedSources - other rules", () => {
	it("handles NOT_RESOLVING_WINNER (only round robin)", () => {
		const error = getValidatedBrackets([
			{
				settings: {},
				type: "round_robin",
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("NOT_RESOLVING_WINNER");
	});

	it("handles NOT_RESOLVING_WINNER (ends in round robin)", () => {
		const error = getValidatedBrackets([
			{
				settings: {},
				type: "single_elimination",
			},
			{
				settings: {},
				type: "round_robin",
				sources: [
					{
						bracketId: "0",
						placements: "1,2",
					},
				],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("NOT_RESOLVING_WINNER");
	});

	it("handles NOT_RESOLVING_WINNER (swiss with many groups)", () => {
		const error = getValidatedBrackets([
			{
				settings: {
					groupCount: 2,
				},
				type: "swiss",
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("NOT_RESOLVING_WINNER");
	});

	// xxx: test first sources = null
});

describe("isFinals", () => {
	it("handles SE", () => {
		expect(Progression.isFinals(0, progressions.singleElimination)).toBe(true);
	});

	it("handles RR->SE", () => {
		expect(
			Progression.isFinals(0, progressions.roundRobinToSingleElimination),
		).toBe(false);
		expect(
			Progression.isFinals(1, progressions.roundRobinToSingleElimination),
		).toBe(true);
	});

	it("handles low ink", () => {
		expect(Progression.isFinals(0, progressions.lowInk)).toBe(false);
		expect(Progression.isFinals(1, progressions.lowInk)).toBe(false);
		expect(Progression.isFinals(2, progressions.lowInk)).toBe(false);
		expect(Progression.isFinals(3, progressions.lowInk)).toBe(true);
	});

	it("many starter brackets", () => {
		expect(Progression.isFinals(0, progressions.manyStartBrackets)).toBe(false);
		expect(Progression.isFinals(1, progressions.manyStartBrackets)).toBe(false);
		expect(Progression.isFinals(2, progressions.manyStartBrackets)).toBe(true);
		expect(Progression.isFinals(3, progressions.manyStartBrackets)).toBe(false);
	});

	it("throws if given idx is out of bounds", () => {
		expect(() =>
			Progression.isFinals(1, progressions.singleElimination),
		).toThrow();
	});
});

describe("isUnderground", () => {
	it("handles SE", () => {
		expect(Progression.isUnderground(0, progressions.singleElimination)).toBe(
			false,
		);
	});

	it("handles RR->SE", () => {
		expect(
			Progression.isUnderground(0, progressions.roundRobinToSingleElimination),
		).toBe(false);
		expect(
			Progression.isUnderground(1, progressions.roundRobinToSingleElimination),
		).toBe(false);
	});

	it("handles low ink", () => {
		expect(Progression.isUnderground(0, progressions.lowInk)).toBe(false);
		expect(Progression.isUnderground(1, progressions.lowInk)).toBe(true);
		expect(Progression.isUnderground(2, progressions.lowInk)).toBe(false);
		expect(Progression.isUnderground(3, progressions.lowInk)).toBe(false);
	});

	it("many starter brackets", () => {
		expect(Progression.isUnderground(0, progressions.manyStartBrackets)).toBe(
			false,
		);
		expect(Progression.isUnderground(1, progressions.manyStartBrackets)).toBe(
			true,
		);
		expect(Progression.isUnderground(2, progressions.manyStartBrackets)).toBe(
			false,
		);
		expect(Progression.isUnderground(3, progressions.manyStartBrackets)).toBe(
			true,
		);
	});

	it("throws if given idx is out of bounds", () => {
		expect(() =>
			Progression.isUnderground(1, progressions.singleElimination),
		).toThrow();
	});
});
