import { describe, expect, test } from "vitest";
import * as Progression from "./Progression";
import { progressions } from "./tests/test-utils";

type BracketInput = Omit<
	Progression.InputBracket,
	"id" | "name" | "requiresCheckIn"
> & { name?: string };

const ROUND_ROBIN: BracketInput = { type: "round_robin", settings: {} };
const ROUND_ROBIN_OF_8: BracketInput = {
	type: "round_robin",
	settings: { teamsPerGroup: 8 },
};
const SINGLE_ELIMINATION: BracketInput = {
	type: "single_elimination",
	settings: {},
};
const DOUBLE_ELIMINATION: BracketInput = {
	type: "double_elimination",
	settings: {},
};
const SWISS: BracketInput = { type: "swiss", settings: {} };
const SWISS_EARLY_ADVANCE: BracketInput = {
	type: "swiss",
	settings: { advanceThreshold: 3 },
};

/** Fills in the ids and names `validatedBrackets` needs so tests only state what they vary. Bracket N is referenced as source bracketId `"N"`. */
const getValidatedBrackets = (brackets: BracketInput[]) =>
	Progression.validatedBrackets(
		brackets.map((bracket, i) => ({
			id: String(i),
			name: bracket.name ?? `Bracket ${i + 1}`,
			requiresCheckIn: false,
			...bracket,
		})),
	);

/** A single elimination bracket taking `placements` from one source bracket. */
const getValidatedBracketsFromPlacements = (
	placements: string,
	source: BracketInput = ROUND_ROBIN,
) =>
	getValidatedBrackets([
		source,
		{
			type: "single_elimination",
			settings: {},
			sources: [{ bracketId: "0", placements }],
		},
	]);

describe("bracketsToValidationError - valid formats", () => {
	test.each([
		["SE", progressions.singleElimination],
		["RR->SE", progressions.roundRobinToSingleElimination],
		["low ink", progressions.lowInk],
		["many starter brackets", progressions.manyStartBrackets],
		["swiss (one group)", progressions.swissOneGroup],
		["a bracket with many source brackets", progressions.multiSourceTopCut],
	] as const)("accepts %s", (_, progression) => {
		expect(Progression.bracketsToValidationError(progression)).toBeNull();
	});
});

describe("validatedSources - placements parsing", () => {
	const PARSED: {
		why: string;
		placements: string;
		expected: Progression.DBSource;
		source?: BracketInput;
	}[] = [
		{
			why: "comma separated",
			placements: "1,2,3,4",
			expected: { bracketIdx: 0, placements: [1, 2, 3, 4] },
		},
		{
			why: "a range",
			placements: "1-4",
			expected: { bracketIdx: 0, placements: [1, 2, 3, 4] },
		},
		{
			why: "a mix of ranges and commas",
			placements: "1,2,3-4",
			expected: { bracketIdx: 0, placements: [1, 2, 3, 4] },
		},
		{
			why: "extra white space",
			placements: "1, 2, 3,4 ",
			expected: { bracketIdx: 0, placements: [1, 2, 3, 4] },
		},
		{
			why: "a range whose start and end are the same",
			placements: "1-1",
			expected: { bracketIdx: 0, placements: [1] },
		},
		{
			why: "negative placements",
			placements: "-1,-2",
			expected: { bracketIdx: 0, placements: [-1, -2] },
			source: DOUBLE_ELIMINATION,
		},
		{
			why: "empty placements from a Swiss bracket with early advance",
			placements: "",
			expected: { bracketIdx: 0, placements: [] },
			source: SWISS_EARLY_ADVANCE,
		},
		{
			why: "a lone rest placement",
			placements: "5+",
			expected: { bracketIdx: 0, placements: [5], rest: true },
			source: ROUND_ROBIN_OF_8,
		},
		{
			why: "rest from the first placement",
			placements: "1+",
			expected: { bracketIdx: 0, placements: [1], rest: true },
			source: ROUND_ROBIN_OF_8,
		},
		{
			why: "rest combined with explicit placements",
			placements: "1,2,3-4,5+",
			expected: { bracketIdx: 0, placements: [1, 2, 3, 4, 5], rest: true },
			source: ROUND_ROBIN_OF_8,
		},
		{
			why: "a range followed by rest, as a single element",
			placements: "1-5+",
			expected: { bracketIdx: 0, placements: [1, 2, 3, 4, 5], rest: true },
			source: ROUND_ROBIN_OF_8,
		},
	];

	test.each(PARSED)("parses $why", ({ placements, expected, source }) => {
		const result = getValidatedBracketsFromPlacements(
			placements,
			source,
		) as Progression.ParsedBracket[];

		expect(result[1].sources).toEqual([expected]);
	});

	const PARSE_ERRORS: {
		why: string;
		placements: string;
		source?: BracketInput;
	}[] = [
		{ why: "invalid characters", placements: "1st,2nd,3rd,4th" },
		{ why: "a zero placement", placements: "0", source: DOUBLE_ELIMINATION },
		{ why: "empty placements from a non-Swiss bracket", placements: "" },
		{
			why: "empty placements from a Swiss bracket without early advance",
			placements: "",
			source: SWISS,
		},
		{
			why: "a reversed range",
			placements: "3-1",
			source: SWISS_EARLY_ADVANCE,
		},
		{
			why: "rest in a non-final position",
			placements: "5+,6",
			source: ROUND_ROBIN_OF_8,
		},
		{ why: "a double plus", placements: "5++", source: ROUND_ROBIN_OF_8 },
		{ why: "a lone plus", placements: "+", source: ROUND_ROBIN_OF_8 },
		{
			why: "rest on a zero placement",
			placements: "0+",
			source: ROUND_ROBIN_OF_8,
		},
		{
			why: "rest on a negative placement",
			placements: "-1+",
			source: DOUBLE_ELIMINATION,
		},
	];

	test.each(PARSE_ERRORS)(
		"flags PLACEMENTS_PARSE_ERROR on $why",
		({ placements, source }) => {
			const error = getValidatedBracketsFromPlacements(
				placements,
				source,
			) as Progression.ValidationError;

			expect(error.type).toBe("PLACEMENTS_PARSE_ERROR");
		},
	);
});

describe('validatedSources - rest "N+" syntax', () => {
	test("round-trips lone rest via input format", () => {
		const validated = getValidatedBracketsFromPlacements(
			"5+",
			ROUND_ROBIN_OF_8,
		) as Progression.ParsedBracket[];
		const inputFormat = Progression.validatedBracketsToInputFormat(validated);
		expect(inputFormat[1].sources?.[0].placements).toBe("5+");
	});

	test("round-trips combined rest via input format", () => {
		const validated = getValidatedBracketsFromPlacements(
			"1,2,3-4,5+",
			ROUND_ROBIN_OF_8,
		) as Progression.ParsedBracket[];
		const inputFormat = Progression.validatedBracketsToInputFormat(validated);
		expect(inputFormat[1].sources?.[0].placements).toBe("1-4,5+");
	});

	test("destinationByPlacement routes placements beyond the rest threshold", () => {
		const validated = getValidatedBracketsFromPlacements(
			"5+",
			ROUND_ROBIN_OF_8,
		) as Progression.ParsedBracket[];
		expect(
			Progression.destinationByPlacement({
				sourceBracketIdx: 0,
				placement: 10,
				progression: validated,
			}),
		).toBe(1);
		expect(
			Progression.destinationByPlacement({
				sourceBracketIdx: 0,
				placement: 4,
				progression: validated,
			}),
		).toBe(null);
	});

	test("flags SAME_PLACEMENT_TO_MULTIPLE_BRACKETS when two rest sources share a bracket", () => {
		const error = getValidatedBrackets([
			ROUND_ROBIN_OF_8,
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1-4" }],
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "5+" }],
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "6+" }],
			},
		]) as Progression.ValidationError;
		expect(error.type).toBe("SAME_PLACEMENT_TO_MULTIPLE_BRACKETS");
	});

	test("flags SAME_PLACEMENT_TO_MULTIPLE_BRACKETS when rest overlaps an explicit placement", () => {
		const error = getValidatedBrackets([
			ROUND_ROBIN_OF_8,
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1-4,5+" }],
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "7" }],
			},
		]) as Progression.ValidationError;
		expect(error.type).toBe("SAME_PLACEMENT_TO_MULTIPLE_BRACKETS");
	});

	test("still flags TOO_MANY_PLACEMENTS when rest's explicit max exceeds teamsPerGroup", () => {
		const error = getValidatedBrackets([
			{
				settings: { teamsPerGroup: 4 },
				type: "round_robin",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1-4" }],
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "5+" }],
			},
		]) as Progression.ValidationError;
		expect(error.type).toBe("TOO_MANY_PLACEMENTS");
	});
});

describe("validatedSources - other rules", () => {
	test("accepts a single round robin with no follow-ups", () => {
		const result = getValidatedBrackets([ROUND_ROBIN]);

		expect(Array.isArray(result)).toBe(true);
	});

	test("accepts a single A/B round robin with no follow-ups", () => {
		const result = getValidatedBrackets([
			{
				settings: {
					hasAbDivisions: true,
					teamsPerGroup: 6,
				},
				type: "round_robin",
			},
		]);

		expect(Array.isArray(result)).toBe(true);
	});

	test("accepts a swiss to round robin progression", () => {
		const result = getValidatedBrackets([
			SWISS,
			{
				settings: {},
				type: "round_robin",
				sources: [{ bracketId: "0", placements: "1,2" }],
			},
		]);

		expect(Array.isArray(result)).toBe(true);
	});

	test("accepts a round robin to round robin progression", () => {
		const result = getValidatedBrackets([
			ROUND_ROBIN,
			{
				settings: {},
				type: "round_robin",
				sources: [{ bracketId: "0", placements: "1,2" }],
			},
		]);

		expect(Array.isArray(result)).toBe(true);
	});

	test("handles NOT_RESOLVING_WINNER (swiss with many groups)", () => {
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

	test("handles SAME_PLACEMENT_TO_MULTIPLE_BRACKETS", () => {
		const error = getValidatedBrackets([
			ROUND_ROBIN,
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1-2" }],
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "2-3" }],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("SAME_PLACEMENT_TO_MULTIPLE_BRACKETS");
		expect((error as any).bracketIdxs).toEqual([1, 2]);
	});

	test("handles GAP_IN_PLACEMENTS", () => {
		const error = getValidatedBrackets([
			ROUND_ROBIN,
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1" }],
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "3" }],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("GAP_IN_PLACEMENTS");
		expect((error as any).bracketIdxs).toEqual([1, 2]);
	});

	test("only flags GAP_IN_PLACEMENTS brackets sourcing from the problematic bracket", () => {
		const error = getValidatedBrackets([
			ROUND_ROBIN,
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1" }],
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "3" }],
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "1", placements: "1" }],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("GAP_IN_PLACEMENTS");
		// bracket 3 sources from bracket 1, not from the gap in bracket 0
		expect((error as any).bracketIdxs).toEqual([1, 2]);
	});

	test("handles TOO_MANY_PLACEMENTS", () => {
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
				sources: [{ bracketId: "0", placements: "1,2,3,4,5" }],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("TOO_MANY_PLACEMENTS");
		expect((error as any).bracketIdx).toEqual(1);
	});

	test("handles PLACEMENT_TOO_HIGH", () => {
		const error = getValidatedBrackets([
			{
				settings: { teamsPerGroup: 200 },
				type: "round_robin",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1-101" }],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("PLACEMENT_TOO_HIGH");
		expect((error as any).bracketIdx).toEqual(1);
	});

	test("does not flag PLACEMENT_TOO_HIGH at the max boundary", () => {
		const result = getValidatedBrackets([
			{
				settings: { teamsPerGroup: 200 },
				type: "round_robin",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1-100" }],
			},
		]);

		expect(Array.isArray(result)).toBe(true);
	});

	test("does not flag TOO_MANY_PLACEMENTS when larger round robin has valid high placements", () => {
		const result = getValidatedBrackets([
			{
				settings: { teamsPerGroup: 6 },
				type: "round_robin",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1,2,3,4,5,6" }],
			},
			{
				settings: { teamsPerGroup: 4 },
				type: "round_robin",
			},
		]);

		expect(Array.isArray(result)).toBe(true);
	});

	test("flags TOO_MANY_PLACEMENTS on A/B divisions when placement exceeds per-division size", () => {
		const error = getValidatedBrackets([
			{
				settings: {
					hasAbDivisions: true,
					teamsPerGroup: 6,
				},
				type: "round_robin",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1,2,3,4" }],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("TOO_MANY_PLACEMENTS");
		expect((error as any).bracketIdx).toEqual(1);
	});

	test("accepts A/B divisions placements up to per-division size", () => {
		const result = getValidatedBrackets([
			{
				settings: {
					hasAbDivisions: true,
					teamsPerGroup: 6,
				},
				type: "round_robin",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1,2,3" }],
			},
		]);

		expect(Array.isArray(result)).toBe(true);
	});

	test("handles DUPLICATE_BRACKET_NAME", () => {
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
				sources: [{ bracketId: "0", placements: "1-2" }],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("DUPLICATE_BRACKET_NAME");
		expect((error as any).bracketIdxs).toEqual([0, 1]);
	});

	test("handles NAME_MISSING", () => {
		const error = getValidatedBrackets([
			{
				settings: {},
				type: "round_robin",
				name: "",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1-2" }],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("NAME_MISSING");
		expect((error as any).bracketIdx).toEqual(0);
	});

	test("handles NEGATIVE_PROGRESSION", () => {
		const error = getValidatedBrackets([
			ROUND_ROBIN,
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "-1,-2" }],
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1" }],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("NEGATIVE_PROGRESSION");
		expect((error as any).bracketIdx).toEqual(1);
	});

	test("allows single elimination positive progression", () => {
		const result = getValidatedBrackets([
			SINGLE_ELIMINATION,
			{
				settings: {},
				type: "double_elimination",
				sources: [{ bracketId: "0", placements: "1-2" }],
			},
		]);

		expect(Progression.isBrackets(result)).toBe(true);
	});

	test("handles MIXED_POSITIVE_NEGATIVE_PLACEMENTS", () => {
		const error = getValidatedBrackets([
			SINGLE_ELIMINATION,
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1,-1" }],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("MIXED_POSITIVE_NEGATIVE_PLACEMENTS");
		expect((error as any).bracketIdx).toEqual(1);
	});

	test("allows single elimination to source an underground bracket", () => {
		const result = getValidatedBrackets([
			SINGLE_ELIMINATION,
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "-1" }],
			},
		]);

		expect(Progression.isBrackets(result)).toBe(true);
	});

	test("allows double elimination positive progression", () => {
		const result = getValidatedBrackets([
			DOUBLE_ELIMINATION,
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1-2" }],
			},
		]);

		expect(Progression.isBrackets(result)).toBe(true);
	});

	test("handles SWISS_EARLY_ADVANCE_NO_DESTINATION", () => {
		// Swiss bracket with early advance but no destination
		const error = getValidatedBrackets([
			{
				settings: {
					advanceThreshold: 3,
				},
				type: "swiss",
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("SWISS_EARLY_ADVANCE_NO_DESTINATION");
		expect((error as any).bracketIdx).toEqual(0);
	});

	test("allows Swiss early advance when bracket has destination", () => {
		// Swiss bracket with early advance that leads to another bracket should be valid
		const result = getValidatedBrackets([
			{
				settings: {
					advanceThreshold: 3,
				},
				type: "swiss",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1-4" }],
			},
		]);

		// Should be valid (no error returned)
		expect(Array.isArray(result)).toBe(true);
	});

	test("accepts A/B divisions on a round robin starting bracket with even teamsPerGroup", () => {
		const result = getValidatedBrackets([
			{
				settings: {
					hasAbDivisions: true,
					teamsPerGroup: 6,
				},
				type: "round_robin",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1-2" }],
			},
		]);

		expect(Array.isArray(result)).toBe(true);
	});

	test("handles AB_DIVISIONS_NOT_ROUND_ROBIN", () => {
		const error = getValidatedBrackets([
			{
				settings: {
					hasAbDivisions: true,
				},
				type: "swiss",
				name: "Swiss",
			},
			{
				settings: {},
				type: "single_elimination",
				name: "Finals",
				sources: [{ bracketId: "0", placements: "1-2" }],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("AB_DIVISIONS_NOT_ROUND_ROBIN");
		expect((error as any).bracketIdx).toEqual(0);
	});

	test("handles AB_DIVISIONS_NOT_STARTING", () => {
		const error = getValidatedBrackets([
			{
				settings: {},
				type: "round_robin",
				name: "Group stage",
			},
			{
				settings: {
					hasAbDivisions: true,
					teamsPerGroup: 4,
				},
				type: "round_robin",
				name: "Second RR",
				sources: [{ bracketId: "0", placements: "1-2" }],
			},
			{
				settings: {},
				type: "single_elimination",
				name: "Finals",
				sources: [{ bracketId: "1", placements: "1-2" }],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("AB_DIVISIONS_NOT_STARTING");
		expect((error as any).bracketIdx).toEqual(1);
	});

	test("handles AB_DIVISIONS_ODD_TEAMS_PER_GROUP", () => {
		const error = getValidatedBrackets([
			{
				settings: {
					hasAbDivisions: true,
					teamsPerGroup: 5,
				},
				type: "round_robin",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1-2" }],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("AB_DIVISIONS_ODD_TEAMS_PER_GROUP");
		expect((error as any).bracketIdx).toEqual(0);
	});

	test("accepts A/B divisions when teamsPerGroup is unset (default is even)", () => {
		const result = getValidatedBrackets([
			{
				settings: {
					hasAbDivisions: true,
				},
				type: "round_robin",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1-2" }],
			},
		]);

		expect(Array.isArray(result)).toBe(true);
	});

	test("does not apply A/B validation when hasAbDivisions is absent", () => {
		const result = getValidatedBrackets([
			{
				settings: {
					teamsPerGroup: 5,
				},
				type: "round_robin",
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1-2" }],
			},
		]);

		expect(Array.isArray(result)).toBe(true);
	});

	test("handles EMPTY_PLACEMENTS_ON_NON_SWISS (DE source with empty placements)", () => {
		const error = Progression.bracketsToValidationError([
			{
				name: "Bracket 1",
				type: "double_elimination",
				settings: {},
				requiresCheckIn: false,
			},
			{
				name: "Bracket 2",
				type: "double_elimination",
				settings: {},
				requiresCheckIn: false,
				sources: [{ bracketIdx: 0, placements: [] }],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("EMPTY_PLACEMENTS_ON_NON_SWISS");
	});

	test("allows empty placements when source is Swiss with advanceThreshold", () => {
		const result = Progression.bracketsToValidationError([
			{
				name: "Swiss",
				type: "swiss",
				settings: { advanceThreshold: 3 },
				requiresCheckIn: false,
			},
			{
				name: "Finals",
				type: "double_elimination",
				settings: {},
				requiresCheckIn: false,
				sources: [{ bracketIdx: 0, placements: [] }],
			},
		]);

		expect(result).toBeNull();
	});
});

describe("isFinals", () => {
	test("handles SE", () => {
		expect(Progression.isFinals(0, progressions.singleElimination)).toBe(true);
	});

	test("handles RR->SE", () => {
		expect(
			Progression.isFinals(0, progressions.roundRobinToSingleElimination),
		).toBe(false);
		expect(
			Progression.isFinals(1, progressions.roundRobinToSingleElimination),
		).toBe(true);
	});

	test("handles low ink", () => {
		expect(Progression.isFinals(0, progressions.lowInk)).toBe(false);
		expect(Progression.isFinals(1, progressions.lowInk)).toBe(false);
		expect(Progression.isFinals(2, progressions.lowInk)).toBe(false);
		expect(Progression.isFinals(3, progressions.lowInk)).toBe(true);
	});

	test("handles swiss (early advance", () => {
		expect(Progression.isFinals(1, progressions.swissEarlyAdvance)).toBe(true);
	});

	test("many starter brackets", () => {
		expect(Progression.isFinals(0, progressions.manyStartBrackets)).toBe(false);
		expect(Progression.isFinals(1, progressions.manyStartBrackets)).toBe(false);
		expect(Progression.isFinals(2, progressions.manyStartBrackets)).toBe(true);
		expect(Progression.isFinals(3, progressions.manyStartBrackets)).toBe(false);
	});

	test("throws if given idx is out of bounds", () => {
		expect(() =>
			Progression.isFinals(1, progressions.singleElimination),
		).toThrow();
	});
});

describe("isUnderground", () => {
	test("handles SE", () => {
		expect(Progression.isUnderground(0, progressions.singleElimination)).toBe(
			false,
		);
	});

	test("handles RR->SE", () => {
		expect(
			Progression.isUnderground(0, progressions.roundRobinToSingleElimination),
		).toBe(false);
		expect(
			Progression.isUnderground(1, progressions.roundRobinToSingleElimination),
		).toBe(false);
	});

	test("handles low ink", () => {
		expect(Progression.isUnderground(0, progressions.lowInk)).toBe(false);
		expect(Progression.isUnderground(1, progressions.lowInk)).toBe(true);
		expect(Progression.isUnderground(2, progressions.lowInk)).toBe(false);
		expect(Progression.isUnderground(3, progressions.lowInk)).toBe(false);
	});

	test("many starter brackets", () => {
		expect(Progression.isUnderground(0, progressions.manyStartBrackets)).toBe(
			false,
		);
		expect(Progression.isUnderground(1, progressions.manyStartBrackets)).toBe(
			false,
		);
		expect(Progression.isUnderground(2, progressions.manyStartBrackets)).toBe(
			false,
		);
		expect(Progression.isUnderground(3, progressions.manyStartBrackets)).toBe(
			false,
		);
	});

	test("handles SE w/ underground bracket", () => {
		expect(
			Progression.isUnderground(
				0,
				progressions.singleEliminationWithUnderground,
			),
		).toBe(false);
		expect(
			Progression.isUnderground(
				1,
				progressions.singleEliminationWithUnderground,
			),
		).toBe(true);
	});

	test("redemption bracket feeding the finals is not underground", () => {
		expect(Progression.isUnderground(0, progressions.multiSourceTopCut)).toBe(
			false,
		);
		expect(Progression.isUnderground(1, progressions.multiSourceTopCut)).toBe(
			false,
		);
		expect(Progression.isUnderground(2, progressions.multiSourceTopCut)).toBe(
			false,
		);
	});

	test("throws if given idx is out of bounds", () => {
		expect(() =>
			Progression.isUnderground(1, progressions.singleElimination),
		).toThrow();
	});
});

describe("changedBracketProgression", () => {
	test("reports changed bracket indexes", () => {
		const withChanges = structuredClone(progressions.lowInk);
		withChanges[0].name = "New name";
		withChanges[1].type = "swiss";

		expect(
			Progression.changedBracketProgression(progressions.lowInk, withChanges),
		).toEqual([0, 1]);
	});

	test("returns an empty array if nothing changed", () => {
		expect(
			Progression.changedBracketProgression(
				progressions.lowInk,
				progressions.lowInk,
			),
		).toEqual([]);
	});
});

describe("bracketIdxsForStandings", () => {
	test("handles SE", () => {
		expect(
			Progression.bracketIdxsForStandings(progressions.singleElimination),
		).toEqual([0]);
	});

	test("handles RR->SE", () => {
		expect(
			Progression.bracketIdxsForStandings(
				progressions.roundRobinToSingleElimination,
			),
		).toEqual([1, 0]);
	});

	test("handles low ink", () => {
		expect(Progression.bracketIdxsForStandings(progressions.lowInk)).toEqual([
			3, 2, 1,
			0,
			// NOTE: 2 is included so that teams eliminated in it are not dropped down to the starting bracket
		]);
	});

	test("handles many starter brackets", () => {
		expect(
			Progression.bracketIdxsForStandings(progressions.manyStartBrackets),
		).toEqual([2, 0]); // NOTE, 3,1 excluded because they are not in the main progression
	});

	test("handles swiss (one group)", () => {
		expect(
			Progression.bracketIdxsForStandings(progressions.swissOneGroup),
		).toEqual([0]);
	});

	test("handles DE w/ underground bracket", () => {
		expect(
			Progression.bracketIdxsForStandings(
				progressions.doubleEliminationWithUnderground,
			),
		).toEqual([0]); // missing 1 because it's underground when DE is the source
	});

	test("handles SE w/ underground bracket", () => {
		expect(
			Progression.bracketIdxsForStandings(
				progressions.singleEliminationWithUnderground,
			),
		).toEqual([0]); // missing 1 because it's underground when SE is the source
	});

	test("does not treat a bracket as intermediate just because an underground bracket sources from it", () => {
		expect(
			Progression.bracketIdxsForStandings(
				progressions.swissToTwoSingleEliminationsWithUnderground,
			),
		).toEqual([1, 2, 0]); // missing 3 because it's underground
	});

	test("keeps a finals bracket sourced positively from a SE redemption bracket", () => {
		expect(
			Progression.bracketIdxsForStandings(progressions.multiSourceTopCut),
		).toEqual([2, 1, 0]);
	});

	test("places a redemption bracket above the brackets taking lower placements from the same source", () => {
		expect(
			Progression.bracketIdxsForStandings(
				progressions.multiSourceTopCutWithConsolation,
			),
		).toEqual([2, 1, 3, 0]);
	});

	test("orders brackets by the placement of their teams in the shared ancestor bracket", () => {
		expect(
			Progression.bracketIdxsForStandings(
				progressions.poolsToBracketsViaIntermediateBrackets,
			),
		).toEqual([
			2, // Alpha (pools 1)
			3, // Beta (pools 2-4, via Redemption)
			1, // Redemption (pools 2-4)
			4, // Gamma (pools 5-6)
			5, // Delta (pools 7-8)
			7, // Epsilon (pools 9-11, via Epsilon Seeding)
			6, // Epsilon Seeding (pools 9-11)
			0, // Day 1 Pools
		]);
	});
});

describe("startingBrackets", () => {
	test("handles SE", () => {
		expect(
			Progression.startingBrackets(progressions.singleElimination),
		).toEqual([0]);
	});

	test("handles many starter brackets", () => {
		expect(
			Progression.startingBrackets(progressions.manyStartBrackets),
		).toEqual([0, 1]);
	});

	test("handles swiss (one group)", () => {
		expect(Progression.startingBrackets(progressions.swissOneGroup)).toEqual([
			0,
		]);
	});
});

describe("destinationsFromBracketIdx", () => {
	test("returns correct destination (one destination)", () => {
		expect(
			Progression.destinationsFromBracketIdx(
				0,
				progressions.roundRobinToSingleElimination,
			),
		).toEqual([1]);
	});

	test("returns correct destination (many destinations)", () => {
		expect(
			Progression.destinationsFromBracketIdx(0, progressions.lowInk),
		).toEqual([1, 2]);
	});

	test("returns an empty array if no destinations", () => {
		expect(
			Progression.destinationsFromBracketIdx(0, progressions.singleElimination),
		).toEqual([]);
	});
});

describe("destinationByPlacement", () => {
	test("returns correct destination for a given placement", () => {
		const result = Progression.destinationByPlacement({
			sourceBracketIdx: 0,
			placement: 1,
			progression: progressions.roundRobinToSingleElimination,
		});
		expect(result).toBe(1);
	});

	test("returns null if no destination for the given placement", () => {
		const result = Progression.destinationByPlacement({
			sourceBracketIdx: 0,
			placement: 5,
			progression: progressions.roundRobinToSingleElimination,
		});
		expect(result).toBeNull();
	});

	test("returns correct destination for negative placements", () => {
		const result = Progression.destinationByPlacement({
			sourceBracketIdx: 0,
			placement: -1,
			progression: progressions.doubleEliminationWithUnderground,
		});
		expect(result).toBe(1);
	});

	test("returns correct destination for many start brackets", () => {
		const result = Progression.destinationByPlacement({
			sourceBracketIdx: 1,
			placement: 1,
			progression: progressions.manyStartBrackets,
		});
		expect(result).toBe(3);
	});
});

describe("validatedBracketsToInputFormat", () => {
	test("converts empty placements back to empty string", () => {
		const parsedBrackets: Progression.ParsedBracket[] = [
			{
				type: "swiss",
				settings: { advanceThreshold: 3 },
				name: "Swiss Bracket",
				requiresCheckIn: false,
			},
			{
				type: "single_elimination",
				settings: {},
				name: "Final Bracket",
				requiresCheckIn: false,
				sources: [
					{
						bracketIdx: 0,
						placements: [],
					},
				],
			},
		];

		const result = Progression.validatedBracketsToInputFormat(parsedBrackets);

		expect(result[1].sources).toEqual([
			{
				bracketId: "0",
				placements: "",
			},
		]);
	});
});

describe("bracketDepth", () => {
	test("returns 0 for starting bracket with no sources", () => {
		expect(Progression.bracketDepth(0, progressions.singleElimination)).toBe(0);
	});

	test("returns 0 for starting bracket and 1 for bracket sourced from it", () => {
		expect(
			Progression.bracketDepth(0, progressions.roundRobinToSingleElimination),
		).toBe(0);
		expect(
			Progression.bracketDepth(1, progressions.roundRobinToSingleElimination),
		).toBe(1);
	});

	test("handles complex progression with multiple depth levels", () => {
		expect(Progression.bracketDepth(0, progressions.lowInk)).toBe(0);
		expect(Progression.bracketDepth(1, progressions.lowInk)).toBe(1);
		expect(Progression.bracketDepth(2, progressions.lowInk)).toBe(1);
		expect(Progression.bracketDepth(3, progressions.lowInk)).toBe(2);
	});

	test("handles multiple starting brackets", () => {
		expect(Progression.bracketDepth(0, progressions.manyStartBrackets)).toBe(0);
		expect(Progression.bracketDepth(1, progressions.manyStartBrackets)).toBe(0);
		expect(Progression.bracketDepth(2, progressions.manyStartBrackets)).toBe(1);
		expect(Progression.bracketDepth(3, progressions.manyStartBrackets)).toBe(1);
	});

	test("handles underground brackets", () => {
		expect(
			Progression.bracketDepth(
				0,
				progressions.doubleEliminationWithUnderground,
			),
		).toBe(0);
		expect(
			Progression.bracketDepth(
				1,
				progressions.doubleEliminationWithUnderground,
			),
		).toBe(1);
	});

	test("throws if given idx is out of bounds", () => {
		expect(() =>
			Progression.bracketDepth(1, progressions.singleElimination),
		).toThrow();
	});
});

describe("validatedSources - DUPLICATE_SOURCE_BRACKET", () => {
	test("flags a destination sourcing the same bracket twice", () => {
		const error = getValidatedBrackets([
			ROUND_ROBIN,
			{
				settings: {},
				type: "single_elimination",
				sources: [
					{ bracketId: "0", placements: "1-2" },
					{ bracketId: "0", placements: "3-4" },
				],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("DUPLICATE_SOURCE_BRACKET");
		expect((error as any).bracketIdx).toBe(1);
	});

	test("accepts different destinations sourcing the same bracket", () => {
		expect(
			Progression.bracketsToValidationError(progressions.lowInk),
		).toBeNull();
	});
});

describe("validatedSources - CYCLIC_PROGRESSION", () => {
	test("flags two brackets sourcing each other", () => {
		const error = getValidatedBrackets([
			ROUND_ROBIN,
			{
				settings: {},
				type: "single_elimination",
				sources: [
					{ bracketId: "0", placements: "1-2" },
					{ bracketId: "2", placements: "1" },
				],
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "1", placements: "1" }],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("CYCLIC_PROGRESSION");
		expect((error as any).bracketIdxs).toEqual([1, 2]);
	});

	test("flags a bracket sourcing itself", () => {
		const error = getValidatedBrackets([
			ROUND_ROBIN,
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "1", placements: "1" }],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("CYCLIC_PROGRESSION");
		expect((error as any).bracketIdxs).toEqual([1]);
	});

	test("accepts a bracket sourcing one that comes later in the list", () => {
		const result = getValidatedBrackets([
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "1", placements: "1-4" }],
			},
			ROUND_ROBIN,
		]);

		expect(Progression.isBrackets(result)).toBe(true);
	});

	test("accepts brackets sharing a source (diamond shaped progression)", () => {
		expect(
			Progression.bracketsToValidationError(progressions.lowInk),
		).toBeNull();
	});
});

describe("validatedSources - MERGED_STARTING_BRACKETS", () => {
	test("flags a bracket sourcing two starting brackets", () => {
		const error = getValidatedBrackets([
			ROUND_ROBIN,
			ROUND_ROBIN,
			{
				settings: {},
				type: "single_elimination",
				sources: [
					{ bracketId: "0", placements: "1-2" },
					{ bracketId: "1", placements: "1-2" },
				],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("MERGED_STARTING_BRACKETS");
		expect((error as any).bracketIdx).toBe(2);
	});

	test("flags a merge that happens through intermediate brackets", () => {
		const error = getValidatedBrackets([
			ROUND_ROBIN,
			ROUND_ROBIN,
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "0", placements: "1-2" }],
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "1", placements: "1-2" }],
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [
					{ bracketId: "2", placements: "1" },
					{ bracketId: "3", placements: "1" },
				],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("MERGED_STARTING_BRACKETS");
		expect((error as any).bracketIdx).toBe(4);
	});

	test("reports the bracket where the merge happens, not the ones after it", () => {
		const error = getValidatedBrackets([
			ROUND_ROBIN,
			ROUND_ROBIN,
			{
				settings: {},
				type: "single_elimination",
				sources: [{ bracketId: "3", placements: "1-2" }],
			},
			{
				settings: {},
				type: "single_elimination",
				sources: [
					{ bracketId: "0", placements: "1-2" },
					{ bracketId: "1", placements: "1-2" },
				],
			},
		]) as Progression.ValidationError;

		expect(error.type).toBe("MERGED_STARTING_BRACKETS");
		expect((error as any).bracketIdx).toBe(3);
	});

	test("accepts many starting brackets that never merge", () => {
		expect(
			Progression.bracketsToValidationError(progressions.manyStartBrackets),
		).toBeNull();
	});

	test("accepts many sources that all come from the same starting bracket", () => {
		expect(
			Progression.bracketsToValidationError(progressions.multiSourceTopCut),
		).toBeNull();
	});
});

describe("sortedSourcesForSeeding", () => {
	test("orders a direct source above one that took a redemption route", () => {
		const topCut: Progression.ParsedBracket = progressions.multiSourceTopCut[2];

		const sorted = Progression.sortedSourcesForSeeding(
			topCut.sources!,
			progressions.multiSourceTopCut,
		);

		expect(sorted.map((source) => source.bracketIdx)).toEqual([0, 1]);
	});

	test("keeps the original order when sources share no ancestor bracket", () => {
		const progression: Progression.ParsedBracket[] = [
			{
				name: "Group A",
				type: "round_robin",
				settings: {},
				requiresCheckIn: false,
			},
			{
				name: "Group B",
				type: "round_robin",
				settings: {},
				requiresCheckIn: false,
			},
			{
				name: "Finals",
				type: "single_elimination",
				settings: {},
				requiresCheckIn: false,
				sources: [
					{ bracketIdx: 1, placements: [1, 2] },
					{ bracketIdx: 0, placements: [1, 2] },
				],
			},
		];

		const sorted = Progression.sortedSourcesForSeeding(
			progression[2].sources!,
			progression,
		);

		expect(sorted.map((source) => source.bracketIdx)).toEqual([1, 0]);
	});

	test("compares at the deepest common ancestor", () => {
		const progression: Progression.ParsedBracket[] = [
			{
				name: "Pools",
				type: "round_robin",
				settings: {},
				requiresCheckIn: false,
			},
			{
				name: "Redemption 1",
				type: "round_robin",
				settings: {},
				requiresCheckIn: false,
				sources: [{ bracketIdx: 0, placements: [5, 6, 7, 8] }],
			},
			{
				name: "Redemption 2",
				type: "round_robin",
				settings: {},
				requiresCheckIn: false,
				sources: [{ bracketIdx: 1, placements: [3, 4] }],
			},
			{
				name: "Finals",
				type: "single_elimination",
				settings: {},
				requiresCheckIn: false,
				sources: [
					{ bracketIdx: 2, placements: [1, 2] },
					{ bracketIdx: 1, placements: [1, 2] },
				],
			},
		];

		const sorted = Progression.sortedSourcesForSeeding(
			progression[3].sources!,
			progression,
		);

		expect(sorted.map((source) => source.bracketIdx)).toEqual([1, 2]);
	});

	test("orders teams eliminated from a follow-up bracket above lower direct placements", () => {
		const progression: Progression.ParsedBracket[] = [
			{
				name: "Pools",
				type: "round_robin",
				settings: {},
				requiresCheckIn: false,
			},
			{
				name: "Top Cut",
				type: "single_elimination",
				settings: {},
				requiresCheckIn: false,
				sources: [{ bracketIdx: 0, placements: [1, 2, 3, 4, 5, 6, 7, 8] }],
			},
			{
				name: "Consolation",
				type: "single_elimination",
				settings: {},
				requiresCheckIn: false,
				sources: [
					{ bracketIdx: 0, placements: [9, 10] },
					{ bracketIdx: 1, placements: [-1] },
				],
			},
		];

		const sorted = Progression.sortedSourcesForSeeding(
			progression[2].sources!,
			progression,
		);

		expect(sorted.map((source) => source.bracketIdx)).toEqual([1, 0]);
	});
});
