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

describe("BracketBuilder.defaultBracketName", () => {
	const nameOf = (number: number) => `Bracket ${number}`;

	test.each([
		{ why: "no brackets", names: [], expected: "Bracket 1" },
		{ why: "only the first bracket", names: ["Main"], expected: "Bracket 2" },
		{
			why: "numbers in use",
			names: ["Main", "Bracket 2", "Bracket 3"],
			expected: "Bracket 4",
		},
		{
			why: "gap left by a removed bracket",
			names: ["Main", "Bracket 3"],
			expected: "Bracket 2",
		},
		{
			why: "lowest gap of several",
			names: ["Main", "Bracket 2", "Bracket 4", "Other"],
			expected: "Bracket 3",
		},
	])("$why -> $expected", ({ names, expected }) => {
		const values = progressionOf(names.map((name) => ({ name })));

		expect(BracketBuilder.defaultBracketName(values, nameOf)).toBe(expected);
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

	test.each([
		{ why: "stops at the last group placement", taken: "1-3", expected: "4" },
		{
			why: "is empty once every group placement is taken",
			taken: "1-4",
			expected: "",
		},
	])("round robin $why", ({ taken, expected }) => {
		const values = progressionOf([
			{ name: "Groups", type: "round_robin", teamsPerGroup: "4" },
			{ name: "Finals", sources: [[0, taken]] },
		]);

		expect(BracketBuilder.defaultPlacements(values, 0)).toBe(expected);
	});

	test("is empty from a Swiss bracket advancing teams early", () => {
		const values = progressionOf([
			{ name: "Swiss", type: "swiss", earlyAdvance: true },
		]);

		expect(BracketBuilder.defaultPlacements(values, 0)).toBe("");
	});
});

describe("BracketBuilder.cardFacts", () => {
	test.each([
		{
			why: "round robin with A/B divisions",
			overrides: {
				type: "round_robin" as const,
				teamsPerGroup: "6",
				hasAbDivisions: true,
			},
			isStarting: true,
			expected: [
				{ type: "TEAMS_PER_GROUP", count: 6 },
				{ type: "AB_DIVISIONS" },
			],
		},
		{
			why: "follow-up round robin leaves out a lingering A/B divisions value",
			overrides: {
				type: "round_robin" as const,
				teamsPerGroup: "4",
				hasAbDivisions: true,
			},
			isStarting: false,
			expected: [{ type: "TEAMS_PER_GROUP", count: 4 }],
		},
		{
			why: "swiss in groups with early advance",
			overrides: {
				type: "swiss" as const,
				groupCount: "2",
				roundCount: "5",
				earlyAdvance: true,
				advanceThreshold: "3",
			},
			isStarting: true,
			expected: [
				{ type: "GROUPS", count: 2 },
				{ type: "ROUNDS", count: 5 },
				{ type: "EARLY_ADVANCE", wins: 3 },
			],
		},
		{
			why: "skipped semifinals without the rounds depending on them",
			overrides: {
				type: "single_elimination" as const,
				skippedRounds: ["SEMIS" as const],
			},
			isStarting: true,
			expected: [{ type: "SKIPPED", round: "SEMIS" }],
		},
		{
			why: "grouped double elimination without bracket reset",
			overrides: {
				type: "double_elimination" as const,
				eliminationGroupCount: "4",
				skippedRounds: ["BRACKET_RESET" as const],
			},
			isStarting: true,
			expected: [
				{ type: "GROUPS", count: 4 },
				{ type: "SKIPPED", round: "BRACKET_RESET" },
			],
		},
	])("$why", ({ overrides, isStarting, expected }) => {
		expect(
			BracketBuilder.cardFacts(bracketValue(overrides), { isStarting }),
		).toEqual(expected);
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

describe("BracketBuilder.fitPlacementsToSources", () => {
	test("drops a group placement after the groups shrink", () => {
		const values = progressionOf([
			{ name: "Groups", type: "round_robin", teamsPerGroup: "3" },
			{ name: "Finals", sources: [[0, "1-2,4"]] },
		]);

		expect(
			BracketBuilder.fitPlacementsToSources(values).progression[1].sources[0]
				.placements,
		).toBe("1-2");
	});

	test("gives a line left with no placements the default picks", () => {
		const values = progressionOf([
			{ name: "Groups", type: "round_robin", teamsPerGroup: "4" },
			{ name: "Finals", sources: [[0, "-1,-2"]] },
		]);

		expect(
			BracketBuilder.fitPlacementsToSources(values).progression[1].sources[0]
				.placements,
		).toBe("1-2");
	});

	test("drops placements of a bracket getting fewer teams", () => {
		const values = progressionOf([
			{ name: "Main", type: "single_elimination", skippedRounds: [] },
			{ name: "Top cut", sources: [[0, "1-2"]] },
			{ name: "Finals", sources: [[1, "1-4"]] },
		]);

		expect(
			BracketBuilder.fitPlacementsToSources(values).progression[2].sources[0]
				.placements,
		).toBe("1-2");
	});

	test("drops everyone below with the placement it counted from", () => {
		const values = progressionOf([
			{ name: "Main", type: "single_elimination", skippedRounds: [] },
			{ name: "Top cut", sources: [[0, "1-2"]] },
			{ name: "Finals", sources: [[1, "1,3+"]] },
			{ name: "Consolation", sources: [[1, "2"]] },
		]);

		const fitted = BracketBuilder.fitPlacementsToSources(values);

		expect(fitted.progression[2].sources[0].placements).toBe("1");
		expect(fitted.progression[3].sources[0].placements).toBe("2");
	});

	test("keeps the values as they are when every placement exists", () => {
		const values = progressionOf([
			{ name: "Main", type: "double_elimination" },
			{ name: "Underground", sources: [[0, "-1,-2"]] },
			{ name: "Top cut", sources: [[0, "1-4"]] },
		]);

		expect(BracketBuilder.fitPlacementsToSources(values)).toBe(values);
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
		minCardHeight: 50,
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
			{ x: 0, y: 20, height: 50 },
			{ x: 0, y: 80, height: 50 },
		]);
		expect(layout.height).toBe(130);
	});

	test("pushes the cards below a card grown to fit its content down", () => {
		const values = progressionOf([{ name: "A" }, { name: "B" }]);

		const layout = BracketBuilder.boardLayout(values, [0, 0], dimensions, [70]);

		expect(layout.cards).toEqual([
			{ x: 0, y: 20, height: 70 },
			{ x: 0, y: 100, height: 50 },
		]);
		expect(layout.height).toBe(150);
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

		expect(layout.cards[1]).toEqual({ x: 140, y: 60, height: 50 });
		expect(mainToFinals?.points).toEqual([
			{ x: 100, y: 45 },
			{ x: 140, y: 35 },
			{ x: 240, y: 35 },
			{ x: 280, y: 45 },
		]);
		expect(mainToFinals?.labelAt).toEqual({ x: 190, y: 35 });
	});
});
