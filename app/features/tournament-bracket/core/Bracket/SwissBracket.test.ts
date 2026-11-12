import { describe, expect, test } from "vitest";
import type { TournamentRoundMaps } from "~/db/tables-json";
import type { BracketData } from "../engine/types";
import { participantIds } from "../tests/bracket-fixtures";
import {
	expandBracketData,
	progressions,
	roundMaps,
	testTournament,
	tournamentCtxTeam,
} from "../tests/test-utils";
import { roundSetKey } from "../toMapList";

type SwissMatch = [
	opponent1: number,
	opponent2: number | null,
	score1?: number,
	score2?: number,
];

const FINISHED_FOUR_TEAMS = () =>
	swissData({
		roundCount: 2,
		groups: [
			[
				[
					[1, 4, 2, 0],
					[2, 3, 2, 1],
				],
				[
					[1, 2, 2, 1],
					[3, 4, 2, 0],
				],
			],
		],
	});

// group winners 2 and 1, runners-up 3 and 4, then 6 and 5, last 7 and 8
const FINISHED_TWO_GROUPS = () =>
	swissData({
		roundCount: 2,
		groups: [
			[
				[
					[2, 7, 2, 0],
					[3, 6, 2, 0],
				],
				[
					[2, 3, 2, 0],
					[6, 7, 2, 0],
				],
			],
			[
				[
					[1, 8, 2, 0],
					[4, 5, 2, 0],
				],
				[
					[1, 4, 2, 0],
					[5, 8, 2, 0],
				],
			],
		],
	});

describe("SwissBracket.standings", () => {
	test("shows each team's set and map record and its opponents' win percentages", () => {
		const standings = swissTournament(FINISHED_FOUR_TEAMS()).bracketByIdx(
			0,
		)!.standings;

		expect(standings.map((s) => [s.team.id, s.stats])).toEqual([
			[
				1,
				{
					setWins: 2,
					setLosses: 0,
					mapWins: 4,
					mapLosses: 1,
					winsAgainstTied: 0,
					lossesAgainstTied: 0,
					opponentSetWinPercentage: 25,
					opponentMapWinPercentage: 30,
				},
			],
			[
				2,
				{
					setWins: 1,
					setLosses: 1,
					mapWins: 3,
					mapLosses: 3,
					winsAgainstTied: 1,
					lossesAgainstTied: 0,
					opponentSetWinPercentage: 75,
					opponentMapWinPercentage: 70,
				},
			],
			[
				3,
				{
					setWins: 1,
					setLosses: 1,
					mapWins: 3,
					mapLosses: 2,
					winsAgainstTied: 0,
					lossesAgainstTied: 1,
					opponentSetWinPercentage: 25,
					opponentMapWinPercentage: 30,
				},
			],
			[
				4,
				{
					setWins: 0,
					setLosses: 2,
					mapWins: 0,
					mapLosses: 4,
					winsAgainstTied: 0,
					lossesAgainstTied: 0,
					opponentSetWinPercentage: 75,
					opponentMapWinPercentage: 70,
				},
			],
		]);
	});

	test("gives a 100% opponent win percentage when every opponent is unbeaten", () => {
		const data = swissData({
			roundCount: 3,
			groups: [
				[
					[
						[1, 4, 2, 0],
						[2, 3, 2, 0],
					],
				],
			],
		});

		const standing = swissTournament(data)
			.bracketByIdx(0)!
			.standings.find((s) => s.team.id === 4);

		expect(standing?.stats).toMatchObject({
			opponentSetWinPercentage: 100,
			opponentMapWinPercentage: 100,
		});
	});

	test("orders teams tied on every tiebreaker by seed", () => {
		const data = swissData({
			roundCount: 3,
			groups: [
				[
					[
						[1, 2, 2, 0],
						[3, 4, 2, 0],
					],
				],
			],
		});

		const standings = swissTournament(data, [
			tournamentCtxTeam(1, { seed: 2 }),
			tournamentCtxTeam(2, { seed: 4 }),
			tournamentCtxTeam(3, { seed: 1 }),
			tournamentCtxTeam(4, { seed: 3 }),
		]).bracketByIdx(0)!.standings;

		expect(standings.map((s) => s.team.id)).toEqual([3, 1, 4, 2]);
	});

	test("does not hold a loss to a team that dropped out mid-run against a tied team", () => {
		const data = swissData({
			roundCount: 3,
			groups: [
				[
					[
						[1, 4, 2, 0],
						[2, 5, 2, 0],
						[3, 6, 2, 0],
					],
					[
						[4, 2, 2, 0],
						[1, 3, 2, 0],
						[5, 6, 2, 0],
					],
				],
			],
		});

		const standings = swissTournament(
			data,
			[1, 2, 3, 4, 5, 6].map((id) =>
				tournamentCtxTeam(id, { seed: id, droppedOut: id === 4 ? 1 : 0 }),
			),
		).bracketByIdx(0)!.standings;

		expect(standings.map((s) => s.team.id)).toEqual([1, 2, 3, 5, 6, 4]);
	});

	test("leaves out a group that is still playing its round", () => {
		const data = swissData({
			roundCount: 3,
			groups: [
				[
					[
						[1, 4, 2, 0],
						[5, 8, 2, 0],
					],
				],
				[
					[
						[2, 3, 2, 0],
						[6, 7],
					],
				],
			],
		});

		const standings = swissTournament(data).bracketByIdx(0)!.standings;

		expect(standings.map((s) => s.team.id)).toEqual([1, 5, 4, 8]);
	});

	test("orders teams of the same placement across groups by the best seed they own or beat", () => {
		const standings = swissTournament(FINISHED_TWO_GROUPS()).bracketByIdx(
			0,
		)!.standings;

		expect(standings.map((s) => [s.team.id, s.placement])).toEqual([
			[1, 1],
			[2, 1],
			[3, 3],
			[4, 3],
			[5, 5],
			[6, 5],
			[7, 7],
			[8, 7],
		]);
	});

	test.each([
		{ why: "best of 5", maps: roundMaps.bestOf5Counterpick, mapWins: 3 },
		{ why: "best of 9", maps: roundMaps.bestOf9, mapWins: 5 },
		{ why: "play all 3", maps: roundMaps.playAll3, mapWins: 3 },
	])(
		"counts a bye as a set won with the maps needed to win its own round ($why)",
		({ maps, mapWins }) => {
			const data = swissData({
				roundCount: 2,
				roundMaps: [roundMaps.bestOf3, maps],
				groups: [
					[
						[
							[1, 2, 2, 0],
							[3, null],
						],
						[
							[3, 1, 2, 1],
							[2, null],
						],
					],
				],
			});

			const standing = swissTournament(data)
				.bracketByIdx(0)!
				.standings.find((s) => s.team.id === 2);

			expect(standing?.stats).toMatchObject({
				setWins: 1,
				setLosses: 1,
				mapWins,
				mapLosses: 2,
			});
		},
	);

	test("does not count a bye as a win in a bracket preview", () => {
		const tournament = testTournament({
			ctx: {
				settings: { bracketProgression: progressions.swissOneGroup },
				teams: [1, 2, 3].map((id) => tournamentCtxTeam(id, { seed: id })),
			},
		});

		const standings = tournament.bracketByIdx(0)!.liveStandings;

		expect(standings.length).toBeGreaterThan(0);
		for (const standing of standings) {
			expect(standing.stats?.setWins).toBe(0);
		}
	});
});

describe("SwissBracket.source", () => {
	test("sources teams as final once every round is played", () => {
		const result = swissTournament(FINISHED_FOUR_TEAMS())
			.bracketByIdx(0)!
			.source({ placements: [1, 2] });

		expect(result).toEqual({ relevantMatchesFinished: true, teams: [1, 2] });
	});

	test("does not source teams as final while a round is still to be paired", () => {
		const data = swissData({
			roundCount: 3,
			groups: [
				[
					[
						[1, 4, 2, 0],
						[2, 3, 2, 0],
					],
					[
						[1, 2, 2, 0],
						[3, 4, 2, 0],
					],
				],
			],
		});

		const { relevantMatchesFinished } = swissTournament(data)
			.bracketByIdx(0)!
			.source({ placements: [1, 2] });

		expect(relevantMatchesFinished).toBe(false);
	});

	test("sources teams as final once every group played every round", () => {
		const { relevantMatchesFinished } = swissTournament(FINISHED_TWO_GROUPS())
			.bracketByIdx(0)!
			.source({ placements: [1] });

		expect(relevantMatchesFinished).toBe(true);
	});

	test.each([
		{ why: "1st of every group", placements: [1], rest: false, teams: [1, 2] },
		{ why: "2nd of every group", placements: [2], rest: false, teams: [3, 4] },
		{
			why: "3rd and below of every group",
			placements: [3],
			rest: true,
			teams: [5, 6, 7, 8],
		},
	])("sources the $why", ({ placements, rest, teams }) => {
		const result = swissTournament(FINISHED_TWO_GROUPS())
			.bracketByIdx(0)!
			.source({ placements, rest });

		expect(result.teams).toEqual(teams);
	});

	test("refuses negative placements", () => {
		const bracket = swissTournament(FINISHED_FOUR_TEAMS()).bracketByIdx(0)!;

		expect(() => bracket.source({ placements: [-1] })).toThrow();
	});
});

describe("SwissBracket.defaultRoundBestOfs", () => {
	test("defaults every round of every group to best of 3", () => {
		const data = FINISHED_TWO_GROUPS();
		const bracket = swissTournament(data).bracketByIdx(0)!;

		const bestOfs = bracket.defaultRoundBestOfs(data);

		for (const round of data.round) {
			expect(bestOfs.get(roundSetKey(round))?.get(round.number)).toEqual({
				count: 3,
				type: "BEST_OF",
			});
		}
	});
});

/** Every group has `roundCount` rounds, the ones without listed matches are not yet paired. A match without scores is unplayed. */
function swissData({
	roundCount,
	groups,
	roundMaps: mapsByRoundIdx = [],
}: {
	roundCount: number;
	groups: SwissMatch[][][];
	roundMaps?: TournamentRoundMaps[];
}): BracketData {
	const roundId = (groupIdx: number, roundIdx: number) =>
		groupIdx * 10 + roundIdx;

	return expandBracketData({
		stage: [
			{
				id: 0,
				type: "swiss",
				settings: { groupCount: groups.length, roundCount },
				number: 1,
			},
		],
		group: groups.map((_, groupIdx) => ({
			id: groupIdx,
			stageId: 0,
			number: groupIdx + 1,
		})),
		round: groups.flatMap((_, groupIdx) =>
			Array.from({ length: roundCount }, (__, roundIdx) => [
				roundId(groupIdx, roundIdx),
				groupIdx,
				roundIdx + 1,
				null,
				mapsByRoundIdx[roundIdx] ?? roundMaps.bestOf3,
			]),
		),
		match: Object.fromEntries(
			groups.flatMap((rounds, groupIdx) =>
				rounds.map((matches, roundIdx) => [
					roundId(groupIdx, roundIdx),
					matches.map(
						([opponent1, opponent2, score1, score2], matchIdx) =>
							[
								roundId(groupIdx, roundIdx) * 10 + matchIdx,
								opponent1,
								opponent2,
								score1,
								score2,
							] as [number, number, number | null, number?, number?],
					),
				]),
			),
		),
	});
}

function swissTournament(
	data: BracketData,
	teams = participantIds(data).map((id) => tournamentCtxTeam(id, { seed: id })),
) {
	return testTournament({
		data,
		ctx: {
			settings: { bracketProgression: progressions.swissOneGroup },
			teams,
		},
	});
}
