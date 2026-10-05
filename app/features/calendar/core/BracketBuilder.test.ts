import { describe, expect, test } from "vitest";
import type { BracketFormValue } from "../calendar-progression-form";
import {
	newBracketFormValue,
	newProgressionSource,
} from "../calendar-progression-form";
import * as BracketBuilder from "./BracketBuilder";

describe("BracketBuilder.columns", () => {
	test("places starting brackets first and follow-ups right of their sources", () => {
		const values = progressionOf([
			{ name: "Groups" },
			{ name: "Top cut", sources: [[0, "1-2"]] },
			{ name: "Finals", sources: [[1, "1-2"]] },
			{ name: "Second division" },
		]);

		expect(BracketBuilder.columns(values)).toEqual([0, 1, 2, 0]);
	});

	test("keeps a follow-up without lines in the column it was dropped to", () => {
		const values = progressionOf([
			{ name: "Groups" },
			{ name: "Later", sources: [] },
		]);

		expect(BracketBuilder.columns(values, [undefined, 3])).toEqual([0, 3]);
	});
});

describe("BracketBuilder.connect", () => {
	test("turns a starting bracket into a follow-up of the source", () => {
		const values = progressionOf([{ name: "Main" }, { name: "Underground" }]);

		const result = BracketBuilder.connect(values, 0, 1);

		expect(result.error).toBeUndefined();
		expect(result.values.progression[1]).toEqual({
			source: "BRACKET",
			sources: [{ bracketIdx: "0", placements: "1-4" }],
		});
	});

	test("preselects the placements after the ones other lines take", () => {
		const values = progressionOf([
			{ name: "Groups", type: "round_robin" },
			{ name: "Upper", sources: [[0, "1-2"]] },
			{ name: "Lower" },
		]);

		const result = BracketBuilder.connect(values, 0, 2);

		expect(result.values.progression[2].sources).toEqual([
			{ bracketIdx: "0", placements: "3-4" },
		]);
	});

	test.each([
		{ why: "into the first bracket", from: 1, to: 0, error: "FIRST_BRACKET" },
		{ why: "to itself", from: 1, to: 1, error: "SAME_BRACKET" },
		{
			why: "back to an earlier column",
			from: 2,
			to: 1,
			error: "EARLIER_BRACKET",
		},
		{
			why: "to a starting bracket from a follow-up",
			from: 1,
			to: 3,
			error: "EARLIER_BRACKET",
		},
	] as const)("refuses a line $why", ({ from, to, error }) => {
		const values = progressionOf([
			{ name: "Main" },
			{ name: "Second", sources: [[0, "1-2"]] },
			{ name: "Third", sources: [[1, "1-2"]] },
			{ name: "Side" },
		]);

		const result = BracketBuilder.connect(values, from, to);

		expect(result.error).toBe(error);
		expect(result.values).toBe(values);
	});

	test("allows a line to a bracket of the same column, moving it right", () => {
		const values = progressionOf([
			{ name: "Main" },
			{ name: "Second", sources: [[0, "1-2"]] },
			{ name: "Third", sources: [] },
		]);

		const result = BracketBuilder.connect(values, 1, 2, [undefined, 1, 1]);

		expect(result.error).toBeUndefined();
		expect(BracketBuilder.columns(result.values, [undefined, 1, 1])).toEqual([
			0, 1, 2,
		]);
	});
});

describe("BracketBuilder.addBracket", () => {
	test("adds the first follow-up to the first follow-up column", () => {
		const values = progressionOf([{ name: "Main" }]);

		const result = BracketBuilder.addBracket(values, "New");

		expect(result.column).toBe(1);
		expect(BracketBuilder.isStartingBracket(result.values, 1)).toBe(false);
		expect(BracketBuilder.columns(result.values, [undefined, 1])).toEqual([
			0, 1,
		]);
	});

	test("adds to the last column holding follow-ups", () => {
		const values = progressionOf([
			{ name: "Groups" },
			{ name: "Top cut", sources: [[0, "1-2"]] },
			{ name: "Finals", sources: [[1, "1-2"]] },
		]);

		expect(BracketBuilder.addBracket(values, "New").column).toBe(2);
	});

	test("counts follow-ups kept in a column without lines", () => {
		const values = progressionOf([
			{ name: "Groups" },
			{ name: "Later", sources: [] },
		]);

		expect(
			BracketBuilder.addBracket(values, "New", [undefined, 3]).column,
		).toBe(3);
	});

	test("adds a starting bracket when there are none", () => {
		const result = BracketBuilder.addBracket(
			{ brackets: [], progression: [] },
			"New",
		);

		expect(result.column).toBe(0);
		expect(result.values.progression[0].source).toBe("SIGN_UP");
	});
});

describe("BracketBuilder.moveToColumn", () => {
	test("moving to the first column makes it a starting bracket without lines", () => {
		const values = progressionOf([
			{ name: "Main" },
			{ name: "Underground", sources: [[0, "-1"]] },
		]);

		const result = BracketBuilder.moveToColumn(values, 1, 0);

		expect(result.removedConnectionCount).toBe(1);
		expect(BracketBuilder.isStartingBracket(result.values, 1)).toBe(true);
	});

	test("moving left of a source removes the line from it", () => {
		const values = progressionOf([
			{ name: "Groups" },
			{ name: "Top cut", sources: [[0, "1-2"]] },
			{
				name: "Finals",
				sources: [
					[0, "3"],
					[1, "1-2"],
				],
			},
		]);

		const result = BracketBuilder.moveToColumn(values, 2, 1);

		expect(result.removedConnectionCount).toBe(1);
		expect(result.values.progression[2].sources).toEqual([
			{ bracketIdx: "0", placements: "3" },
		]);
	});

	test("never moves the first bracket", () => {
		const values = progressionOf([{ name: "Main" }]);

		expect(BracketBuilder.moveToColumn(values, 0, 2).values).toBe(values);
	});
});

describe("BracketBuilder.removeBracket", () => {
	test("drops the bracket's lines and shifts the sources after it", () => {
		const values = progressionOf([
			{ name: "Groups" },
			{ name: "Removed", sources: [[0, "3-4"]] },
			{
				name: "Finals",
				sources: [
					[0, "1-2"],
					[1, "1"],
				],
			},
		]);

		const result = BracketBuilder.removeBracket(values, 1);

		expect(result.brackets.map((bracket) => bracket.name)).toEqual([
			"Groups",
			"Finals",
		]);
		expect(result.progression[1].sources).toEqual([
			{ bracketIdx: "0", placements: "1-2" },
		]);
	});
});

describe("BracketBuilder.defaultPlacements", () => {
	test.each([
		{
			why: "single elimination top 4, semifinal losers sharing 3rd",
			overrides: {
				type: "single_elimination" as const,
				skippedRounds: ["THIRD_PLACE_MATCH" as const],
			},
			expected: "1-3",
		},
		{
			why: "single elimination top 4 with a third place match",
			overrides: { type: "single_elimination" as const, skippedRounds: [] },
			expected: "1-4",
		},
		{
			why: "single elimination with skipped finals the teams still in",
			overrides: {
				type: "single_elimination" as const,
				skippedRounds: ["FINALS" as const],
			},
			expected: "1",
		},
		{
			why: "double elimination top 4",
			overrides: { type: "double_elimination" as const },
			expected: "1-4",
		},
		{
			why: "round robin top 2 per group",
			overrides: { type: "round_robin" as const },
			expected: "1-2",
		},
		{
			why: "swiss top 8",
			overrides: { type: "swiss" as const },
			expected: "1-8",
		},
	])("$why", ({ overrides, expected }) => {
		const values = progressionOf([{ name: "Main", ...overrides }]);

		expect(BracketBuilder.defaultPlacements(values, 0)).toBe(expected);
	});

	test("takes everyone below once the top placements are taken", () => {
		const values = progressionOf([
			{
				name: "Main",
				type: "single_elimination",
				skippedRounds: ["THIRD_PLACE_MATCH"],
			},
			{ name: "Top cut", sources: [[0, "1-3"]] },
		]);

		expect(BracketBuilder.defaultPlacements(values, 0)).toBe("4+");
	});

	test("is empty from a Swiss bracket advancing teams early", () => {
		const values = progressionOf([
			{ name: "Swiss", type: "swiss", earlyAdvance: true },
		]);

		expect(BracketBuilder.defaultPlacements(values, 0)).toBe("");
	});
});

describe("BracketBuilder.placementTiers", () => {
	test("both semifinal losers share a placement without a third place match", () => {
		const tiers = BracketBuilder.placementTiers(
			bracketValue({
				type: "single_elimination",
				skippedRounds: ["THIRD_PLACE_MATCH"],
			}),
		);

		expect(
			tiers
				.slice(0, 4)
				.map((tier) => [tier.placement, tier.kind, tier.maxTeams]),
		).toEqual([
			[1, "WON_FINAL", 1],
			[2, "LOST_FINAL", 1],
			[3, "LOST_SEMIFINALS", 2],
			[4, "LOST_QUARTERFINALS", 4],
		]);
	});

	test("lists only the tiers a bracket with at most 6 teams can have", () => {
		const tiers = BracketBuilder.placementTiers(
			bracketValue({ type: "double_elimination" }),
			6,
		);

		expect(tiers.map((tier) => tier.maxTeams)).toEqual([1, 1, 1, 1, 2]);
	});

	test("elimination split into groups has every group's tiers", () => {
		const tiers = BracketBuilder.placementTiers(
			bracketValue({
				type: "double_elimination",
				eliminationGroupCount: "8",
				skippedRounds: [
					"LB_SEMIS",
					"LB_FINALS",
					"GRAND_FINALS",
					"BRACKET_RESET",
				],
			}),
		);

		expect(
			tiers
				.slice(0, 2)
				.map((tier) => [tier.kind, tier.maxTeams, tier.maxTeamsPerGroup]),
		).toEqual([
			["UNBEATEN", 8, 1],
			["ALIVE_WITH_ONE_LOSS", 24, 3],
		]);
	});

	test("elimination split into more groups than its teams allow has fewer groups", () => {
		const tiers = BracketBuilder.placementTiers(
			bracketValue({ type: "single_elimination", eliminationGroupCount: "4" }),
			6,
		);

		expect(
			tiers.map((tier) => [tier.kind, tier.maxTeams, tier.maxTeamsPerGroup]),
		).toEqual([
			["WON_FINAL", 3, 1],
			["LOST_FINAL", 3, 1],
		]);
	});

	test("round robin has a placement per position in a group", () => {
		const tiers = BracketBuilder.placementTiers(
			bracketValue({ type: "round_robin", teamsPerGroup: "4" }),
		);

		expect(tiers.map((tier) => tier.placement)).toEqual([1, 2, 3, 4]);
	});
});

describe("BracketBuilder.maxTeamCounts", () => {
	test("follows the top picks down the progression but not what depends on sign-ups", () => {
		const values = progressionOf([
			{ name: "Swiss", type: "swiss" },
			{ name: "Top cut", type: "double_elimination", sources: [[0, "1-8"]] },
			{ name: "Finals", sources: [[1, "1-4"]] },
			{ name: "Underground", sources: [[0, "9+"]] },
		]);

		expect(BracketBuilder.maxTeamCounts(values)).toEqual([null, 8, 4, null]);
	});

	test("knows how many group winners advance before teams sign up", () => {
		const values = progressionOf([
			{
				name: "Main",
				type: "double_elimination",
				eliminationGroupCount: "8",
				skippedRounds: [
					"LB_SEMIS",
					"LB_FINALS",
					"GRAND_FINALS",
					"BRACKET_RESET",
				],
			},
			{ name: "Top cut", sources: [[0, "1"]] },
		]);

		expect(BracketBuilder.maxTeamCounts(values)).toEqual([null, 8]);
	});
});

function bracketValue(overrides: Partial<BracketFormValue>): BracketFormValue {
	return { ...newBracketFormValue(), name: "Bracket", ...overrides };
}

function progressionOf(
	brackets: Array<
		Partial<BracketFormValue> & {
			sources?: Array<[number, string]>;
		}
	>,
): BracketBuilder.BuilderValues {
	return {
		brackets: brackets.map(({ sources: _sources, ...overrides }) =>
			bracketValue(overrides),
		),
		progression: brackets.map(({ sources }) =>
			sources
				? {
						source: "BRACKET",
						sources: sources.map(([bracketIdx, placements]) => ({
							bracketIdx: String(bracketIdx),
							placements,
						})),
					}
				: { source: "SIGN_UP", sources: [newProgressionSource()] },
		),
	};
}

describe("BracketBuilder.boardLayout", () => {
	const dimensions: BracketBuilder.BoardDimensions = {
		cardWidth: 100,
		cardHeight: 50,
		columnGap: 40,
		rowGap: 10,
		headerHeight: 20,
		padding: 0,
		laneHeight: 30,
	};

	test("stacks the cards of a column", () => {
		const values = progressionOf([{ name: "A" }, { name: "B" }]);

		const layout = BracketBuilder.boardLayout(values, [0, 0], dimensions);

		expect(layout.cards).toEqual([
			{ x: 0, y: 20 },
			{ x: 0, y: 80 },
		]);
		expect(layout.height).toBe(130);
	});

	test("passes a line skipping a column through a lane above the card it would cross", () => {
		const values = progressionOf([
			{ name: "Main" },
			{ name: "Underground", sources: [[0, "-1"]] },
			{
				name: "Finals",
				sources: [
					[0, "1-4"],
					[1, "1"],
				],
			},
		]);

		const layout = BracketBuilder.boardLayout(values, [0, 1, 2], dimensions);
		const mainToFinals = layout.lines.find(
			(_, lineIdx) =>
				BracketBuilder.connections(values)[lineIdx].fromIdx === 0 &&
				BracketBuilder.connections(values)[lineIdx].toIdx === 2,
		);

		expect(layout.cards[1]).toEqual({ x: 140, y: 60 });
		expect(mainToFinals?.points).toEqual([
			{ x: 100, y: 45 },
			{ x: 140, y: 35 },
			{ x: 240, y: 35 },
			{ x: 280, y: 45 },
		]);
		expect(mainToFinals?.labelAt).toEqual({ x: 190, y: 35 });
	});
});
