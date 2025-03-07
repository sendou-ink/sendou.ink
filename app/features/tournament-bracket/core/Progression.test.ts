import { describe, expect, it } from "vitest";
import * as Progression from "./Progression";
import { progressions } from "./tests/test-utils";

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

	it("handles parsing with negative placements", () => {
		const result = Progression.validatedBrackets([
			{
				id: "1",
				name: "Bracket 1",
				type: "double_elimination",
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
						placements: "-1,-2",
					},
				],
			},
		]) as Progression.ParsedBracket[];

		expect(result[1].sources).toEqual([
			{ bracketIdx: 0, placements: [-1, -2] },
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
	brackets: (Omit<
		Progression.InputBracket,
		"id" | "name" | "requiresCheckIn"
	> & { name?: string })[],
) =>
	Progression.validatedBrackets(
		brackets.map((b, i) => ({
			id: String(i),
			name: b.name ?? `Bracket ${i + 1}`,
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

	it("handles SAME_PLACEMENT_TO_MULTIPLE_BRACKETS", () => {
		const error = getValidatedBrackets([
			{
				settings: {},
				type: "round_robin",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [
					{
						bracketId: "0",
						placements: "1-2",
					},
				],
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [
					{
						bracketId: "0",
						placements: "2-3",
					},
				],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("SAME_PLACEMENT_TO_MULTIPLE_BRACKETS");
		expect((error as any).bracketIdxs).toEqual([1, 2]);
	});

	it("handles GAP_IN_PLACEMENTS", () => {
		const error = getValidatedBrackets([
			{
				settings: {},
				type: "round_robin",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [
					{
						bracketId: "0",
						placements: "1",
					},
				],
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [
					{
						bracketId: "0",
						placements: "3",
					},
				],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("GAP_IN_PLACEMENTS");
		expect((error as any).bracketIdxs).toEqual([1, 2]);
	});

	it("handles TOO_MANY_PLACEMENTS", () => {
		const error = getValidatedBrackets([
			{
				settings: {
					teamsPerGroup: 4,
				},
				type: "round_robin",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [
					{
						bracketId: "0",
						placements: "1,2,3,4,5",
					},
				],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("TOO_MANY_PLACEMENTS");
		expect((error as any).bracketIdx).toEqual(1);
	});

	it("handles DUPLICATE_BRACKET_NAME", () => {
		const error = getValidatedBrackets([
			{
				settings: {},
				type: "round_robin",
				name: "Bracket 1",
			},
			{
				settings: {},
				type: "single_elimination",
				name: "Bracket 1",
				sources: [
					{
						bracketId: "0",
						placements: "1-2",
					},
				],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("DUPLICATE_BRACKET_NAME");
		expect((error as any).bracketIdxs).toEqual([0, 1]);
	});

	it("handles NAME_MISSING", () => {
		const error = getValidatedBrackets([
			{
				settings: {},
				type: "round_robin",
				name: "",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [
					{
						bracketId: "0",
						placements: "1-2",
					},
				],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("NAME_MISSING");
		expect((error as any).bracketIdx).toEqual(0);
	});

	it("handles NEGATIVE_PROGRESSION", () => {
		const error = getValidatedBrackets([
			{
				settings: {},
				type: "round_robin",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [
					{
						bracketId: "0",
						placements: "-1,-2",
					},
				],
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [
					{
						bracketId: "0",
						placements: "1",
					},
				],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("NEGATIVE_PROGRESSION");
		expect((error as any).bracketIdx).toEqual(1);
	});

	it("handles NO_SE_SOURCE", () => {
		const error = getValidatedBrackets([
			{
				settings: {},
				type: "single_elimination",
			},
			{
				settings: {},
				type: "double_elimination",
				sources: [
					{
						bracketId: "0",
						placements: "1-2",
					},
				],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("NO_SE_SOURCE");
		expect((error as any).bracketIdx).toEqual(1);
	});

	it("handles NO_DE_POSITIVE", () => {
		const error = getValidatedBrackets([
			{
				settings: {},
				type: "double_elimination",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [
					{
						bracketId: "0",
						placements: "1-2",
					},
				],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("NO_DE_POSITIVE");
		expect((error as any).bracketIdx).toEqual(1);
	});
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

describe("changedBracketProgression", () => {
	it("reports changed bracket indexes", () => {
		const withChanges = structuredClone(progressions.lowInk);
		withChanges[0].name = "New name";
		withChanges[1].type = "swiss";

		expect(
			Progression.changedBracketProgression(progressions.lowInk, withChanges),
		).toEqual([0, 1]);
	});

	it("returns an empty array if nothing changed", () => {
		expect(
			Progression.changedBracketProgression(
				progressions.lowInk,
				progressions.lowInk,
			),
		).toEqual([]);
	});
});

describe("bracketIdxsForStandings", () => {
	it("handles SE", () => {
		expect(
			Progression.bracketIdxsForStandings(progressions.singleElimination),
		).toEqual([0]);
	});

	it("handles RR->SE", () => {
		expect(
			Progression.bracketIdxsForStandings(
				progressions.roundRobinToSingleElimination,
			),
		).toEqual([1, 0]);
	});

	it("handles low ink", () => {
		expect(Progression.bracketIdxsForStandings(progressions.lowInk)).toEqual([
			3, 1,
			0,
			// NOTE: 2 is omitted as it's an "intermediate" bracket
		]);
	});

	it("handles many starter brackets", () => {
		expect(
			Progression.bracketIdxsForStandings(progressions.manyStartBrackets),
		).toEqual([2, 0]); // NOTE, 3,1 excluded because they are not in the main progression
	});

	it("handles swiss (one group)", () => {
		expect(
			Progression.bracketIdxsForStandings(progressions.swissOneGroup),
		).toEqual([0]);
	});

	it("handles DE w/ underground bracket", () => {
		expect(
			Progression.bracketIdxsForStandings(
				progressions.doubleEliminationWithUnderground,
			),
		).toEqual([0]); // missing 1 because it's underground when DE is the source
	});
});

describe("destinationsFromBracketIdx", () => {
	it("returns correct destination (one destination)", () => {
		expect(
			Progression.destinationsFromBracketIdx(
				0,
				progressions.roundRobinToSingleElimination,
			),
		).toEqual([1]);
	});

	it("returns correct destination (many destinations)", () => {
		expect(
			Progression.destinationsFromBracketIdx(0, progressions.lowInk),
		).toEqual([1, 2]);
	});

	it("returns an empty array if no destinations", () => {
		expect(
			Progression.destinationsFromBracketIdx(0, progressions.singleElimination),
		).toEqual([]);
	});
});

describe("destinationByPlacement", () => {
	it("returns correct destination for a given placement", () => {
		const result = Progression.destinationByPlacement({
			sourceBracketIdx: 0,
			placement: 1,
			progression: progressions.roundRobinToSingleElimination,
		});
		expect(result).toBe(1);
	});

	it("returns null if no destination for the given placement", () => {
		const result = Progression.destinationByPlacement({
			sourceBracketIdx: 0,
			placement: 5,
			progression: progressions.roundRobinToSingleElimination,
		});
		expect(result).toBeNull();
	});

	it("returns correct destination for negative placements", () => {
		const result = Progression.destinationByPlacement({
			sourceBracketIdx: 0,
			placement: -1,
			progression: progressions.doubleEliminationWithUnderground,
		});
		expect(result).toBe(1);
	});

	it("returns correct destination for many start brackets", () => {
		const result = Progression.destinationByPlacement({
			sourceBracketIdx: 1,
			placement: 1,
			progression: progressions.manyStartBrackets,
		});
		expect(result).toBe(3);
	});
});
