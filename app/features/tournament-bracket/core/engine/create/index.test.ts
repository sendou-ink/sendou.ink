import { describe, expect, test } from "vitest";
import * as Engine from "../index";
import type { BracketData, CreateBracketInput, RoundMapsInput } from "../types";

const EIGHT_TEAMS = [1, 2, 3, 4, 5, 6, 7, 8];

describe("Engine.create", () => {
	test.each<{ why: string; input: CreateBracketInput }>([
		{
			why: "single elimination",
			input: {
				type: "single_elimination",
				seeding: EIGHT_TEAMS,
				settings: { groupCount: 2 },
			},
		},
		{
			why: "double elimination",
			input: {
				type: "double_elimination",
				seeding: EIGHT_TEAMS,
				settings: { groupCount: 2 },
			},
		},
		{
			why: "round robin",
			input: {
				type: "round_robin",
				seeding: EIGHT_TEAMS,
				settings: { teamsPerGroup: 4 },
			},
		},
		{
			why: "round robin with A/B divisions",
			input: {
				type: "round_robin",
				seeding: EIGHT_TEAMS,
				settings: { teamsPerGroup: 4, hasAbDivisions: true },
				abDivisions: [0, 1, 0, 1, 0, 1, 0, 1],
			},
		},
		{
			why: "swiss",
			input: {
				type: "swiss",
				seeding: EIGHT_TEAMS,
				settings: { groupCount: 2 },
			},
		},
	])("numbers the groups from 1 ($why)", ({ input }) => {
		const data = Engine.create(input);

		expect(data.group.map((group) => group.number)).toEqual([1, 2]);
	});

	test("numbers the rounds of an A/B division round robin from 1", () => {
		const data = Engine.create({
			type: "round_robin",
			seeding: [1, 2, 3, 4, 5, 6],
			settings: { teamsPerGroup: 6, hasAbDivisions: true },
			abDivisions: [0, 1, 0, 1, 0, 1],
		});

		expect(data.round.map((round) => round.number)).toEqual([1, 2, 3]);
	});

	test("holds the later round robin rounds until the teams have played the earlier ones by default", () => {
		const data = Engine.create({
			type: "round_robin",
			seeding: [1, 2, 3, 4],
			settings: null,
		});

		expect(new Set(Engine.matchStatuses(data).values())).toEqual(
			new Set(["STARTED", "PENDING"]),
		);
	});

	test("lets every round of a round robin with independent rounds be played right away", () => {
		const data = Engine.create({
			type: "round_robin",
			seeding: [1, 2, 3, 4],
			settings: null,
			independentRounds: true,
		});

		expect(new Set(Engine.matchStatuses(data).values())).toEqual(
			new Set(["STARTED"]),
		);
	});

	test("refuses a grouped elimination seeding with the same team twice", () => {
		expect(() =>
			Engine.create({
				type: "single_elimination",
				seeding: [1, 2, 3, 4, 5, 6, 7, 1],
				settings: { groupCount: 2 },
			}),
		).toThrow("The seeding has a duplicate participant.");
	});

	describe("map lists", () => {
		test("gives the rounds of every round robin group the map list of their round number", () => {
			// groups of 5 and 4 teams, 5 and 3 rounds
			const input: CreateBracketInput = {
				type: "round_robin",
				seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9],
				settings: { teamsPerGroup: 5 },
			};
			const preview = Engine.create(input);

			const data = Engine.create({
				...input,
				maps: preview.round
					.filter((round) => round.groupId === 0)
					.map((round) => mapsOf(round.id, countForRound(round.number))),
			});

			expect(data.round.length).toBe(8);
			for (const round of data.round) {
				expect(round.maps?.count).toBe(countForRound(round.number));
			}
		});

		test("refuses a round robin with a map list missing", () => {
			const input: CreateBracketInput = {
				type: "round_robin",
				seeding: [1, 2, 3, 4],
				settings: null,
			};
			const preview = Engine.create(input);

			expect(() =>
				Engine.create({
					...input,
					maps: preview.round
						.slice(1)
						.map((round) => mapsOf(round.id, countForRound(round.number))),
				}),
			).toThrow();
		});

		test("gives a smaller elimination group the map lists of the bigger group's rounds as far from the end", () => {
			// groups of 5 and 4 teams: the bigger one has a round more
			const input: CreateBracketInput = {
				type: "single_elimination",
				seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9],
				settings: { groupCount: 2 },
			};
			const preview = Engine.create(input);
			const biggerGroupRounds = preview.round.filter(
				(round) => round.groupId === 0,
			);
			const countOf = (round: BracketData["round"][number]) =>
				round.section === "finals" ? 1 : countForRound(round.number);

			const data = Engine.create({
				...input,
				maps: biggerGroupRounds.map((round) =>
					mapsOf(round.id, countOf(round)),
				),
			});

			const smallerGroupCounts = data.round
				.filter((round) => round.groupId === 1)
				.map((round) => [round.section, round.number, round.maps?.count]);
			expect(smallerGroupCounts).toEqual([
				["winners", 1, countForRound(2)],
				["winners", 2, countForRound(3)],
				["finals", 1, 1],
			]);
		});

		test("refuses an elimination bracket with a round missing its map list", () => {
			const input: CreateBracketInput = {
				type: "single_elimination",
				seeding: EIGHT_TEAMS,
				settings: null,
			};
			const preview = Engine.create(input);

			expect(() =>
				Engine.create({
					...input,
					maps: preview.round
						.slice(1)
						.map((round) => mapsOf(round.id, countForRound(round.number))),
				}),
			).toThrow();
		});
	});
});

function countForRound(roundNumber: number) {
	return roundNumber * 2 + 1;
}

function mapsOf(roundId: number, count: number): RoundMapsInput {
	return { roundId, count, type: "BEST_OF" };
}
