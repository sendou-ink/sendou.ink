import { describe, expect, test } from "vitest";
import type { BracketData } from "../engine/types";
import { participantIds } from "../tests/bracket-fixtures";
import {
	expandBracketData,
	roundMaps,
	testTournament,
	tournamentCtxTeam,
} from "../tests/test-utils";
import { roundSetKey } from "../toMapList";

type GroupMatch = [
	opponent1: number,
	opponent2: number,
	score1?: number,
	score2?: number,
];

describe("RoundRobinBracket.standings", () => {
	test("totals each team's set, map and KO record over its played matches", () => {
		const data = roundRobinData([
			[
				[1, 2, 2, 1],
				[3, 4, 2, 0],
				[1, 3, 2, 0],
				[2, 4, 2, 1],
				[1, 4, 0, 2],
				[2, 3, 1, 2],
			],
		]);
		withKos(data, { matchIdx: 0, teamId: 1, kos: 1 });
		withKos(data, { matchIdx: 2, teamId: 1, kos: 2 });
		withKos(data, { matchIdx: 4, teamId: 4, kos: 1 });

		const standings = roundRobinTournament(data).bracketByIdx(0)!.standings;

		expect(standings.map((s) => [s.team.id, s.stats])).toEqual([
			[
				1,
				{
					setWins: 2,
					setLosses: 1,
					mapWins: 4,
					mapLosses: 3,
					winsAgainstTied: 1,
					koCount: 3,
				},
			],
			[
				3,
				{
					setWins: 2,
					setLosses: 1,
					mapWins: 4,
					mapLosses: 3,
					winsAgainstTied: 0,
					koCount: 0,
				},
			],
			[
				2,
				{
					setWins: 1,
					setLosses: 2,
					mapWins: 4,
					mapLosses: 5,
					winsAgainstTied: 1,
					koCount: 0,
				},
			],
			[
				4,
				{
					setWins: 1,
					setLosses: 2,
					mapWins: 3,
					mapLosses: 4,
					winsAgainstTied: 0,
					koCount: 1,
				},
			],
		]);
	});

	test("ranks the head-to-head winner above a team tied on set wins with a better map record", () => {
		const data = roundRobinData([
			[
				[1, 2, 2, 1],
				[2, 3, 2, 0],
				[2, 4, 2, 0],
				[1, 3, 1, 2],
				[1, 4, 2, 1],
				[3, 4, 1, 2],
			],
		]);

		const standings = roundRobinTournament(data).bracketByIdx(0)!.standings;

		expect(standings.map((s) => s.team.id)).toEqual([1, 2, 4, 3]);
	});

	test("orders teams tied on every tiebreaker by seed", () => {
		const data = roundRobinData([
			[
				[1, 2, 2, 1],
				[2, 3, 2, 1],
				[3, 1, 2, 1],
			],
		]);

		const standings = roundRobinTournament(data, [
			tournamentCtxTeam(1, { seed: 3 }),
			tournamentCtxTeam(2, { seed: 1 }),
			tournamentCtxTeam(3, { seed: 2 }),
		]).bracketByIdx(0)!.standings;

		expect(standings.map((s) => s.team.id)).toEqual([2, 3, 1]);
	});

	test("places a team that dropped out last even with the best record", () => {
		const data = roundRobinData([
			[
				[1, 2, 2, 0],
				[3, 4, 2, 0],
				[1, 3, 2, 0],
				[2, 4, 2, 0],
				[1, 4, 2, 0],
				[2, 3, 2, 0],
			],
		]);

		const standings = roundRobinTournament(data, [
			tournamentCtxTeam(1, { seed: 1, droppedOut: 1 }),
			tournamentCtxTeam(2, { seed: 2 }),
			tournamentCtxTeam(3, { seed: 3 }),
			tournamentCtxTeam(4, { seed: 4 }),
		]).bracketByIdx(0)!.standings;

		expect(standings.map((s) => s.team.id)).toEqual([2, 3, 4, 1]);
	});

	test("shows an empty record for a team that dropped out before playing all its matches", () => {
		const data = roundRobinData([
			[
				[1, 2, 2, 0],
				[3, 4, 2, 0],
				[1, 3, 2, 0],
				[2, 4, 2, 0],
				[1, 4],
				[2, 3, 2, 0],
			],
		]);

		const standings = roundRobinTournament(data, [
			tournamentCtxTeam(1, { seed: 1, droppedOut: 1 }),
			tournamentCtxTeam(2, { seed: 2 }),
			tournamentCtxTeam(3, { seed: 3 }),
			tournamentCtxTeam(4, { seed: 4 }),
		]).bracketByIdx(0)!.liveStandings;

		expect(standings.at(-1)).toMatchObject({
			team: { id: 1 },
			stats: {
				setWins: 0,
				setLosses: 0,
				mapWins: 0,
				mapLosses: 0,
				winsAgainstTied: 0,
				koCount: 0,
			},
		});
	});

	test("leaves out a group that is still playing", () => {
		const data = roundRobinData([
			[
				[1, 4, 2, 0],
				[1, 5, 2, 0],
				[4, 5, 2, 0],
			],
			[
				[2, 3, 2, 0],
				[2, 6, 2, 0],
				[3, 6],
			],
		]);

		const standings = roundRobinTournament(data).bracketByIdx(0)!.standings;

		expect(standings.map((s) => s.team.id)).toEqual([1, 4, 5]);
	});

	test("orders teams of the same placement across groups by the best seed they own or beat", () => {
		const data = roundRobinData([
			[
				[2, 3, 2, 0],
				[2, 6, 2, 0],
				[3, 6, 2, 0],
			],
			[
				[1, 4, 2, 0],
				[1, 5, 2, 0],
				[4, 5, 2, 0],
			],
		]);

		const standings = roundRobinTournament(data).bracketByIdx(0)!.standings;

		expect(standings.map((s) => [s.team.id, s.placement])).toEqual([
			[1, 1],
			[2, 1],
			[3, 3],
			[4, 3],
			[5, 5],
			[6, 5],
		]);
	});
});

describe("RoundRobinBracket.liveStandings", () => {
	test("counts only the played matches of a group still playing", () => {
		const data = roundRobinData([
			[
				[1, 2, 2, 0],
				[1, 3, 2, 0],
				[2, 3],
			],
		]);

		const standings = roundRobinTournament(data).bracketByIdx(0)!.liveStandings;

		expect(
			standings.map((s) => [s.team.id, s.stats?.setWins, s.stats?.setLosses]),
		).toEqual([
			[1, 2, 0],
			[2, 0, 1],
			[3, 0, 1],
		]);
	});

	test("keeps crediting wins over a team that dropped out after playing all its matches", () => {
		const data = roundRobinData([
			[
				[1, 2],
				[3, 4, 2, 0],
				[1, 4, 2, 0],
				[2, 4, 2, 0],
			],
		]);

		const standings = roundRobinTournament(data, [
			tournamentCtxTeam(1, { seed: 1 }),
			tournamentCtxTeam(2, { seed: 2 }),
			tournamentCtxTeam(3, { seed: 3 }),
			tournamentCtxTeam(4, { seed: 4, droppedOut: 1 }),
		]).bracketByIdx(0)!.liveStandings;

		expect(
			standings.map((s) => [s.team.id, s.stats?.setWins, s.stats?.setLosses]),
		).toEqual([
			[1, 1, 0],
			[2, 1, 0],
			[3, 1, 0],
			[4, 0, 3],
		]);
	});
});

describe("RoundRobinBracket.source", () => {
	test("sources the teams from the last given placement down when the rest are included", () => {
		const data = roundRobinData([
			[
				[1, 2, 2, 1],
				[3, 4, 2, 0],
				[1, 3, 2, 0],
				[2, 4, 2, 1],
				[1, 4, 0, 2],
				[2, 3, 1, 2],
			],
		]);

		const { teams } = roundRobinTournament(data)
			.bracketByIdx(0)!
			.source({ placements: [3], rest: true });

		expect(teams).toEqual([2, 4]);
	});

	test("sources each A/B division's teams from the last given placement down when the rest are included", () => {
		const data = roundRobinData([
			[
				[1, 2, 2, 0],
				[1, 4, 2, 0],
				[1, 6, 2, 0],
				[3, 2, 0, 2],
				[3, 4, 2, 0],
				[3, 6, 2, 0],
				[5, 2, 0, 2],
				[5, 4, 0, 2],
				[5, 6, 2, 0],
			],
		]);

		const { teams } = roundRobinTournament(
			data,
			[1, 2, 3, 4, 5, 6].map((id) =>
				tournamentCtxTeam(id, { seed: id, abDivision: id % 2 === 1 ? 0 : 1 }),
			),
			{ hasAbDivisions: true },
		)
			.bracketByIdx(0)!
			.source({ placements: [2], rest: true });

		expect(teams).toEqual([3, 5, 4, 6]);
	});

	test("refuses negative placements", () => {
		const data = roundRobinData([[[1, 2, 2, 0]]]);

		expect(() =>
			roundRobinTournament(data)
				.bracketByIdx(0)!
				.source({ placements: [-1] }),
		).toThrow();
	});
});

describe("RoundRobinBracket.defaultRoundBestOfs", () => {
	test("defaults every round of every group to best of 3", () => {
		const data = expandBracketData({
			stage: [
				{
					id: 0,
					type: "round_robin",
					settings: { groupCount: 2 },
					number: 1,
				},
			],
			group: [
				{ id: 0, stageId: 0, number: 1 },
				{ id: 1, stageId: 0, number: 2 },
			],
			round: [
				[0, 0, 1, null],
				[1, 0, 2, null],
				[2, 0, 3, null],
				[3, 1, 1, null],
				[4, 1, 2, null],
				[5, 1, 3, null],
			],
			match: {},
		});
		const bracket = roundRobinTournament(data).bracketByIdx(0)!;

		const bestOfs = bracket.defaultRoundBestOfs(data);

		for (const round of data.round) {
			expect(bestOfs.get(roundSetKey(round))?.get(round.number)).toEqual({
				count: 3,
				type: "BEST_OF",
			});
		}
	});
});

/** One round per group, a match without scores is unplayed. */
function roundRobinData(groups: GroupMatch[][]): BracketData {
	return expandBracketData({
		stage: [
			{
				id: 0,
				type: "round_robin",
				settings: { groupCount: groups.length },
				number: 1,
			},
		],
		group: groups.map((_, groupIdx) => ({
			id: groupIdx,
			stageId: 0,
			number: groupIdx + 1,
		})),
		round: groups.map((_, groupIdx) => [
			groupIdx,
			groupIdx,
			1,
			null,
			roundMaps.bestOf3,
		]),
		match: Object.fromEntries(
			groups.map((matches, groupIdx) => [
				groupIdx,
				matches.map(
					([opponent1, opponent2, score1, score2], matchIdx) =>
						[
							groupIdx * 100 + matchIdx,
							opponent1,
							opponent2,
							score1,
							score2,
						] as [number, number, number, number?, number?],
				),
			]),
		),
	});
}

function withKos(
	data: BracketData,
	{ matchIdx, teamId, kos }: { matchIdx: number; teamId: number; kos: number },
) {
	const match = data.match[matchIdx];
	const opponent =
		match.opponent1?.id === teamId ? match.opponent1 : match.opponent2;
	opponent!.totalKos = kos;
}

function roundRobinTournament(
	data: BracketData,
	teams = participantIds(data).map((id) => tournamentCtxTeam(id, { seed: id })),
	settings = {},
) {
	return testTournament({
		data,
		ctx: {
			settings: {
				bracketProgression: [
					{
						type: "round_robin",
						name: "Main Bracket",
						requiresCheckIn: false,
						settings,
					},
				],
			},
			teams,
		},
	});
}
