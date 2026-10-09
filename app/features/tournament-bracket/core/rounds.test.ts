import { describe, expect, test } from "vitest";
import type { TournamentStageSettings } from "~/db/tables-json";
import { nullFilledArray } from "~/utils/arrays";
import * as Engine from "./engine";
import { getRounds } from "./rounds";

describe("getRounds", () => {
	test.each<{
		why: string;
		teamCount: number;
		settings: TournamentStageSettings;
		expected: string[];
	}>([
		{
			why: "single match",
			teamCount: 2,
			settings: {},
			expected: ["Finals"],
		},
		{
			why: "4 teams",
			teamCount: 4,
			settings: {},
			expected: ["Semis", "Finals", "3rd place match"],
		},
		{
			why: "8 teams",
			teamCount: 8,
			settings: {},
			expected: ["Round 1", "Semis", "Finals", "3rd place match"],
		},
		{
			why: "16 teams",
			teamCount: 16,
			settings: {},
			expected: ["Round 1", "Round 2", "Semis", "Finals", "3rd place match"],
		},
		{
			why: "skipped third place match",
			teamCount: 8,
			settings: { skippedRounds: ["THIRD_PLACE_MATCH"] },
			expected: ["Round 1", "Semis", "Finals"],
		},
		{
			why: "skipped finals",
			teamCount: 8,
			settings: { skippedRounds: ["FINALS"] },
			expected: ["Round 1", "Semis", "3rd place match"],
		},
		{
			why: "skipped finals, 4 teams",
			teamCount: 4,
			settings: { skippedRounds: ["FINALS"] },
			expected: ["Semis", "3rd place match"],
		},
		{
			why: "skipped semis",
			teamCount: 16,
			settings: { skippedRounds: ["SEMIS"] },
			expected: ["Round 1", "Round 2"],
		},
		{
			why: "skipped semis leaving no match plays the semis",
			teamCount: 4,
			settings: { skippedRounds: ["SEMIS"] },
			expected: ["Semis"],
		},
	])(
		"names single elimination rounds ($why)",
		({ teamCount, settings, expected }) => {
			const bracketData = createBracket({
				type: "single_elimination",
				teamCount,
				settings,
			});

			expect(roundNames(getRounds({ type: "single", bracketData }))).toEqual(
				expected,
			);
		},
	);

	test.each<{
		why: string;
		teamCount: number;
		settings: TournamentStageSettings;
		winners: string[];
		losers: string[];
	}>([
		{
			why: "single match",
			teamCount: 2,
			settings: {},
			winners: ["Grand Finals"],
			losers: [],
		},
		{
			why: "4 teams",
			teamCount: 4,
			settings: {},
			winners: ["WB Semis", "WB Finals", "Grand Finals", "Bracket Reset"],
			losers: ["LB Semis", "LB Finals"],
		},
		{
			why: "8 teams",
			teamCount: 8,
			settings: {},
			winners: [
				"WB Round 1",
				"WB Semis",
				"WB Finals",
				"Grand Finals",
				"Bracket Reset",
			],
			losers: ["LB Round 1", "LB Round 2", "LB Semis", "LB Finals"],
		},
		{
			why: "skipped bracket reset",
			teamCount: 8,
			settings: { skippedRounds: ["BRACKET_RESET"] },
			winners: ["WB Round 1", "WB Semis", "WB Finals", "Grand Finals"],
			losers: ["LB Round 1", "LB Round 2", "LB Semis", "LB Finals"],
		},
		{
			why: "skipped grand finals",
			teamCount: 8,
			settings: { skippedRounds: ["GRAND_FINALS"] },
			winners: ["WB Round 1", "WB Semis", "WB Finals"],
			losers: ["LB Round 1", "LB Round 2", "LB Semis", "LB Finals"],
		},
		{
			why: "skipped LB finals",
			teamCount: 8,
			settings: { skippedRounds: ["LB_FINALS"] },
			winners: ["WB Round 1", "WB Semis", "WB Finals"],
			losers: ["LB Round 1", "LB Round 2", "LB Semis"],
		},
		{
			why: "skipped LB semis",
			teamCount: 8,
			settings: { skippedRounds: ["LB_SEMIS"] },
			winners: ["WB Round 1", "WB Semis", "WB Finals"],
			losers: ["LB Round 1", "LB Round 2"],
		},
		{
			why: "skipped WB finals",
			teamCount: 8,
			settings: { skippedRounds: ["WB_FINALS"] },
			winners: ["WB Round 1", "WB Semis"],
			losers: ["LB Round 1", "LB Round 2", "LB Semis"],
		},
	])(
		"names double elimination rounds ($why)",
		({ teamCount, settings, winners, losers }) => {
			const bracketData = createBracket({
				type: "double_elimination",
				teamCount,
				settings,
			});

			expect(roundNames(getRounds({ type: "winners", bracketData }))).toEqual(
				winners,
			);
			expect(roundNames(getRounds({ type: "losers", bracketData }))).toEqual(
				losers,
			);
		},
	);

	test.each<{
		why: string;
		grandFinalsWinner: "opponent1" | "opponent2" | null;
		expected: string[];
	}>([
		{
			why: "WB side won",
			grandFinalsWinner: "opponent1",
			expected: ["WB Semis", "WB Finals", "Grand Finals"],
		},
		{
			why: "LB side won",
			grandFinalsWinner: "opponent2",
			expected: ["WB Semis", "WB Finals", "Grand Finals", "Bracket Reset"],
		},
		{
			why: "not played",
			grandFinalsWinner: null,
			expected: ["WB Semis", "WB Finals", "Grand Finals", "Bracket Reset"],
		},
	])(
		"shows the bracket reset only when it can be played ($why)",
		({ grandFinalsWinner, expected }) => {
			const bracketData = createBracket({
				type: "double_elimination",
				teamCount: 4,
			});
			const grandFinals = bracketData.round.find(
				(round) => round.section === "finals" && round.number === 1,
			);
			const grandFinalsMatch = bracketData.match.find(
				(match) => match.roundId === grandFinals?.id,
			);
			if (!grandFinalsMatch) throw new Error("No grand finals match");
			grandFinalsMatch.winnerSide = grandFinalsWinner;

			expect(roundNames(getRounds({ type: "winners", bracketData }))).toEqual(
				expected,
			);
		},
	);

	test("starts losers round numbers from 1 when the first losers round is only byes", () => {
		const bracketData = createBracket({
			type: "double_elimination",
			teamCount: 5,
		});

		expect(
			getRounds({ type: "losers", bracketData }).map((round) => ({
				number: round.number,
				name: round.name,
			})),
		).toEqual([
			{ number: 1, name: "LB Round 1" },
			{ number: 2, name: "LB Semis" },
			{ number: 3, name: "LB Finals" },
		]);
	});

	describe("grouped bracket", () => {
		const groupedSingleElimination = () =>
			createBracket({
				type: "single_elimination",
				teamCount: 5,
				settings: { groupCount: 2 },
			});

		test("returns the rounds of the first group by default", () => {
			const bracketData = groupedSingleElimination();
			const [firstGroup] = bracketData.group;

			const rounds = getRounds({ type: "single", bracketData });

			expect(
				rounds.map((round) => ({
					groupId: round.groupId,
					section: round.section,
					number: round.number,
					name: round.name,
				})),
			).toEqual([
				{
					groupId: firstGroup.id,
					section: "winners",
					number: 1,
					name: "Semis",
				},
				{
					groupId: firstGroup.id,
					section: "winners",
					number: 2,
					name: "Finals",
				},
			]);
		});

		test("returns the rounds of the given group", () => {
			const bracketData = groupedSingleElimination();
			const secondGroup = bracketData.group[1];

			const rounds = getRounds({
				type: "single",
				bracketData,
				groupId: secondGroup.id,
			});

			expect(
				rounds.map((round) => ({
					groupId: round.groupId,
					section: round.section,
					number: round.number,
					name: round.name,
				})),
			).toEqual([
				{
					groupId: secondGroup.id,
					section: "winners",
					number: 1,
					name: "Finals",
				},
			]);
		});

		test("names the only match of a 2-team double elimination group the grand finals", () => {
			const bracketData = createBracket({
				type: "double_elimination",
				teamCount: 5,
				settings: { groupCount: 2 },
			});
			const twoTeamGroupId = bracketData.group[1].id;

			expect(
				roundNames(
					getRounds({ type: "winners", bracketData, groupId: twoTeamGroupId }),
				),
			).toEqual(["Grand Finals"]);
			expect(
				getRounds({ type: "losers", bracketData, groupId: twoTeamGroupId }),
			).toEqual([]);
			expect(roundNames(getRounds({ type: "winners", bracketData }))).toEqual([
				"WB Semis",
				"WB Finals",
				"Grand Finals",
				"Bracket Reset",
			]);
		});
	});
});

function createBracket({
	type,
	teamCount,
	settings = {},
}: {
	type: "single_elimination" | "double_elimination";
	teamCount: number;
	settings?: TournamentStageSettings;
}) {
	return Engine.create({
		type,
		seeding: nullFilledArray(teamCount).map((_, i) => i + 1),
		settings,
	});
}

function roundNames(rounds: Array<{ name: string }>) {
	return rounds.map((round) => round.name);
}
