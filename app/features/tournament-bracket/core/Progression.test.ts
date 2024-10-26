// validate progression
// - ends in not rr or grouped
// - no two placements to different brackets
// - no "gap" in placements
// - not too much placements relative to teams per group (RR only)
// - no two brackets with the same name
// - all brackets have names
// - no same source bracket twice in the same object
// - many starting brackets https://discord.com/channels/299182152161951744/1288567178836312194/1288567178836312194
// - startTime???

import { describe, expect, it } from "vitest";
import * as Progression from "./Progression";

// approximate number of teams

// standings to new bracket participants

describe("validatedSources - PLACEMENTS_PARSE_ERROR", () => {
	const getValidatedBracketsFromPlacements = (placements: string) => {
		return Progression.validatedSources([
			{ id: "1", name: "Bracket 1", type: "round_robin", settings: {} },
			{
				id: "2",
				name: "Bracket 2",
				type: "single_elimination",
				settings: {},
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
		) as Progression.ValidatedBracket[];

		expect(result[1].sources).toEqual([
			{ bracketIdx: 0, placements: [1, 2, 3, 4] },
		]);
	});

	it("parses placements correctly (separated by line)", () => {
		const result = getValidatedBracketsFromPlacements(
			"1-4",
		) as Progression.ValidatedBracket[];

		expect(result[1].sources).toEqual([
			{ bracketIdx: 0, placements: [1, 2, 3, 4] },
		]);
	});

	it("parses placements correctly (separated by a mix)", () => {
		const result = getValidatedBracketsFromPlacements(
			"1,2,3-4",
		) as Progression.ValidatedBracket[];

		expect(result[1].sources).toEqual([
			{ bracketIdx: 0, placements: [1, 2, 3, 4] },
		]);
	});

	it("handles placement where ranges start and end is the same", () => {
		const result = getValidatedBracketsFromPlacements(
			"1-1",
		) as Progression.ValidatedBracket[];

		expect(result[1].sources).toEqual([{ bracketIdx: 0, placements: [1] }]);
	});

	it("handles parsing with extra white space", () => {
		const result = getValidatedBracketsFromPlacements(
			"1, 2, 3,4 ",
		) as Progression.ValidatedBracket[];

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
	brackets: Omit<Progression.InputBracket, "id" | "name">[],
) =>
	Progression.validatedSources(
		brackets.map((b, i) => ({ id: String(i), name: `Bracket ${i + 1}`, ...b })),
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
});

// separate tests for known valid rules
// - swiss, 1 group
