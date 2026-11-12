import * as R from "remeda";
import { describe, expect, test } from "vitest";
import type { TournamentSettings } from "~/db/tables-json";
import * as Engine from "../engine";
import type { BracketData } from "../engine/types";
import {
	byRound,
	loserOf,
	matchesOfRound,
	playedOut,
	playedWhile,
	reportWinner,
	teamIds,
} from "../tests/bracket-fixtures";
import { testTournament } from "../tests/test-utils";
import type { BracketMapCounts } from "../toMapList";

type BracketSettings =
	TournamentSettings["bracketProgression"][number]["settings"];

const MAIN: TournamentSettings["bracketProgression"][number] = {
	type: "double_elimination",
	name: "Main",
	requiresCheckIn: false,
	settings: {},
};
const NO_BRACKET_RESET: BracketSettings = {
	skippedRounds: ["BRACKET_RESET"],
};
const NO_GRAND_FINALS: BracketSettings = {
	skippedRounds: ["GRAND_FINALS", "BRACKET_RESET"],
};
const NO_LOSERS_FINALS_NOR_GRAND_FINALS: BracketSettings = {
	skippedRounds: ["LB_FINALS", "GRAND_FINALS", "BRACKET_RESET"],
};

describe("DoubleEliminationBracket.defaultRoundBestOfs", () => {
	test.each([
		{
			teamCount: 8,
			expected: {
				winners: [3, 3, 5],
				losers: [3, 3, 3, 5],
				finals: [5, 5],
			},
		},
		{
			teamCount: 16,
			expected: {
				winners: [3, 3, 5, 5],
				losers: [3, 3, 3, 3, 3, 5],
				finals: [5, 5],
			},
		},
	])(
		"plays the winners rounds from the third on, the losers final and the grand finals of $teamCount teams best of 5, the rest best of 3",
		({ teamCount, expected }) => {
			const bracket = mainBracket(created(teamCount));

			expect(
				bestOfsBySection(bracket.defaultRoundBestOfs(bracket.data)),
			).toEqual(expected);
		},
	);

	test("gives a losers round of only byes no map count", () => {
		const data = created(5);
		const bracket = mainBracket(data);

		expect(
			matchesOfRound(data, "losers", 1).every(
				(match) => !match.opponent1 || !match.opponent2,
			),
		).toBe(true);
		expect(bracket.defaultRoundBestOfs(data).get("0:losers")?.has(1)).toBe(
			false,
		);
	});
});

describe("DoubleEliminationBracket.standings", () => {
	test("ranks both teams of a two team bracket once it is played", () => {
		const bracket = mainBracket(playedOut(created(2)));

		expect(top(bracket, 2)).toEqual([
			[1, 1],
			[2, 2],
		]);
	});

	test("does not place the grand finalists before the grand finals are played", () => {
		const bracket = mainBracket(
			playedWhile(
				created(4),
				(match, played) => !isFinals(played, match.roundId),
			),
		);

		expect(bracket.standings.map((standing) => standing.placement)).toEqual([
			3, 4,
		]);
	});

	test.each([
		{ resetWinnerSide: "opponent1", champion: 1 },
		{ resetWinnerSide: "opponent2", champion: 2 },
	] as const)(
		"the bracket reset decides 1st after the losers bracket team wins the grand finals (reset won by $resetWinnerSide)",
		({ resetWinnerSide, champion }) => {
			// team 2 drops to the losers bracket by losing the winners final to team 1
			let data = playedWhile(
				created(4),
				(match, played) => !isFinals(played, match.roundId),
			);
			data = reportWinner(
				data,
				matchesOfRound(data, "finals", 1)[0].id,
				"opponent2",
			);
			data = reportWinner(
				data,
				matchesOfRound(data, "finals", 2)[0].id,
				resetWinnerSide,
			);

			expect(top(mainBracket(data), 2)).toEqual([
				[champion, 1],
				[3 - champion, 2],
			]);
		},
	);

	test("the losers bracket team winning the grand finals takes 1st when the bracket reset is skipped", () => {
		let data = playedWhile(
			created(4, NO_BRACKET_RESET),
			(match, played) => !isFinals(played, match.roundId),
		);
		data = reportWinner(
			data,
			matchesOfRound(data, "finals", 1)[0].id,
			"opponent2",
		);

		expect(top(mainBracket(data, NO_BRACKET_RESET), 2)).toEqual([
			[2, 1],
			[1, 2],
		]);
	});

	test("without grand finals does not place the teams still in until every match is over", () => {
		const data = created(8, NO_GRAND_FINALS);
		const losersFinalId = matchesOfRound(data, "losers", 4)[0].id;
		const bracket = mainBracket(
			playedWhile(data, (match) => match.id !== losersFinalId),
			NO_GRAND_FINALS,
		);

		expect(
			bracket.standings.map((standing) => standing.placement).toSorted(),
		).toEqual([4, 5, 5, 7, 7]);
	});

	test("without grand finals the losers bracket winner takes 2nd when the winners final loser was knocked out", () => {
		// team 2 loses the winners final and then the losers final to team 3
		const bracket = mainBracket(
			playedOut(created(8, NO_GRAND_FINALS), [1, 3]),
			NO_GRAND_FINALS,
		);

		expect(top(bracket, 3)).toEqual([
			[1, 1],
			[3, 2],
			[2, 3],
		]);
	});

	test("without losers finals nor grand finals the winners final loser places 2nd even when the winners final was an upset", () => {
		// team 2 beats team 1 in the winners final
		const bracket = mainBracket(
			playedOut(created(8, NO_LOSERS_FINALS_NOR_GRAND_FINALS), [2]),
			NO_LOSERS_FINALS_NOR_GRAND_FINALS,
		);

		expect(top(bracket, 3)).toEqual([
			[2, 1],
			[1, 2],
			[3, 3],
		]);
	});

	test("without a winners final the teams still in with one loss share a placement", () => {
		const settings: BracketSettings = {
			skippedRounds: [
				"WB_FINALS",
				"LB_SEMIS",
				"LB_FINALS",
				"GRAND_FINALS",
				"BRACKET_RESET",
			],
		};
		const bracket = mainBracket(playedOut(created(8, settings)), settings);

		expect(top(bracket, 4)).toEqual([
			[1, 1],
			[2, 1],
			[3, 3],
			[4, 3],
		]);
	});
});

describe("DoubleEliminationBracket.everyMatchOver", () => {
	test("is over once the winners bracket team wins the grand finals, the bracket reset left unplayed", () => {
		const bracket = mainBracket(playedOut(created(4)));

		expect(bracket.everyMatchOver).toBe(true);
	});

	test("is not over after the losers bracket team wins the grand finals until the bracket reset is played", () => {
		let data = playedWhile(
			created(4),
			(match, played) => !isFinals(played, match.roundId),
		);
		data = reportWinner(
			data,
			matchesOfRound(data, "finals", 1)[0].id,
			"opponent2",
		);

		expect(mainBracket(data).everyMatchOver).toBe(false);

		data = reportWinner(
			data,
			matchesOfRound(data, "finals", 2)[0].id,
			"opponent1",
		);

		expect(mainBracket(data).everyMatchOver).toBe(true);
	});

	test("is not over while a match is unplayed", () => {
		const data = created(8);
		const losersFinalId = matchesOfRound(data, "losers", 4)[0].id;

		expect(
			mainBracket(playedWhile(data, (match) => match.id !== losersFinalId))
				.everyMatchOver,
		).toBe(false);
	});

	test("is over once every match is played even with matches against a BYE", () => {
		expect(mainBracket(playedOut(created(5))).everyMatchOver).toBe(true);
	});

	test("waits for the bracket reset of the group whose losers bracket team won the grand finals", () => {
		const settings: BracketSettings = { groupCount: 2 };
		const data = created(8, settings);
		const [firstGroup, secondGroup] = data.group.map((group) => group.id);
		let played = playedWhile(
			data,
			(match, current) => !isFinals(current, match.roundId),
		);
		played = reportWinner(
			played,
			matchesOfRound(played, "finals", 1, firstGroup)[0].id,
			"opponent1",
		);
		played = reportWinner(
			played,
			matchesOfRound(played, "finals", 1, secondGroup)[0].id,
			"opponent2",
		);

		expect(mainBracket(played, settings).everyMatchOver).toBe(false);
	});
});

describe("DoubleEliminationBracket.source", () => {
	test("sources the losers of later losers rounds ahead of earlier ones, group by group", () => {
		const settings: BracketSettings = { groupCount: 2 };
		const data = playedOut(created(16, settings));
		const [firstGroup, secondGroup] = data.group.map((group) => group.id);
		const losersOf = (number: number, groupId: number) =>
			matchesOfRound(data, "losers", number, groupId).map(loserOf);

		expect(
			mainBracket(data, settings).source({ placements: [-1, -2] }).teams,
		).toEqual([
			...losersOf(2, firstGroup),
			...losersOf(2, secondGroup),
			...losersOf(1, firstGroup),
			...losersOf(1, secondGroup),
		]);
	});

	test("does not source the knocked out teams while their losers rounds are being played", () => {
		const data = created(8);
		const losersRoundTwoIds = new Set(
			matchesOfRound(data, "losers", 2).map((match) => match.id),
		);
		const bracket = mainBracket(
			playedWhile(data, (match) => !losersRoundTwoIds.has(match.id)),
		);

		expect(
			bracket.source({ placements: [-1, -2] }).relevantMatchesFinished,
		).toBe(false);
	});

	test("skips the matches against a BYE when sourcing knocked out teams", () => {
		const data = playedOut(created(5));
		const firstLosersRoundWithMatches = matchesOfRound(data, "losers", 2);

		expect(mainBracket(data).source({ placements: [-1] })).toEqual({
			relevantMatchesFinished: true,
			teams: firstLosersRoundWithMatches
				.filter((match) => match.opponent1 && match.opponent2)
				.map(loserOf),
		});
	});
});

describe("DoubleEliminationBracket.matchExitDestinations", () => {
	test("the losers of each losers round leave to the bracket taking their placement", () => {
		const data = created(8);
		const exits = mainBracket(data, {}, [
			["Third", [3]],
			["Fourth", [4]],
			["Fifth", [5]],
			["Seventh", [6]],
		]).matchExitDestinations();

		expect(byRound(exits, data)).toEqual({
			"winners 1": Array(4).fill(undefined),
			"winners 2": Array(2).fill(undefined),
			"winners 3": [undefined],
			"losers 1": Array(2).fill({ winner: null, loser: 4 }),
			"losers 2": Array(2).fill({ winner: null, loser: 3 }),
			"losers 3": [{ winner: null, loser: 2 }],
			"losers 4": [{ winner: null, loser: 1 }],
			"finals 1": [undefined],
			"finals 2": [undefined],
		});
	});

	test("the losers of the first losers rounds leave to the underground bracket", () => {
		const data = created(8);
		const exits = mainBracket(data, {}, [
			["Underground", [-1, -2]],
		]).matchExitDestinations();

		expect(byRound(exits, data)).toMatchObject({
			"losers 1": Array(2).fill({ winner: null, loser: 1 }),
			"losers 2": Array(2).fill({ winner: null, loser: 1 }),
			"losers 3": [undefined],
		});
	});

	test("the first losers round with matches counts as the first for the underground bracket when the one before it is only byes", () => {
		const data = playedOut(created(5));
		const tournament = testTournament({
			ctx: {
				settings: {
					bracketProgression: progression({}, [["Underground", [-1]]]),
				},
			},
			data,
		});
		const exits = tournament.bracketByIdx(0)!.matchExitDestinations();
		const firstLosersRoundWithMatches = matchesOfRound(data, "losers", 2);

		expect(byRound(exits, data)).toMatchObject({
			"losers 1": [undefined, undefined],
			"losers 2": [
				{ winner: null, loser: 1 },
				{ winner: null, loser: 1 },
			],
			"losers 3": [undefined],
		});
		expect(tournament.bracketByIdx(1)!.previewSeeding).toEqual(
			firstLosersRoundWithMatches
				.filter((match) => match.opponent1 && match.opponent2)
				.map(loserOf),
		);
	});

	test("before the grand finals are played only the bracket reset sends teams to the brackets taking 1st and 2nd", () => {
		const data = created(8);
		const exits = mainBracket(data, {}, [
			["Champion", [1]],
			["Runner-up", [2]],
		]).matchExitDestinations();

		expect(byRound(exits, data)).toEqual({
			"winners 1": Array(4).fill(undefined),
			"winners 2": Array(2).fill(undefined),
			"winners 3": [undefined],
			"losers 1": Array(2).fill(undefined),
			"losers 2": Array(2).fill(undefined),
			"losers 3": [undefined],
			"losers 4": [undefined],
			"finals 1": [undefined],
			"finals 2": [{ winner: 1, loser: 2 }],
		});
	});

	test("the grand finals send their teams to the brackets taking 1st and 2nd when the winners bracket team wins them", () => {
		const data = playedOut(created(8));
		const exits = mainBracket(data, {}, [
			["Champion", [1]],
			["Runner-up", [2]],
		]).matchExitDestinations();

		expect(byRound(exits, data)).toMatchObject({
			"finals 1": [{ winner: 1, loser: 2 }],
		});
	});

	test("without grand finals the winners final winner and the losers bracket winner leave to the brackets taking 1st and 2nd", () => {
		const data = created(8, NO_GRAND_FINALS);
		const exits = mainBracket(data, NO_GRAND_FINALS, [
			["Champion", [1]],
			["Runner-up", [2]],
			["Third", [3]],
		]).matchExitDestinations();

		expect(byRound(exits, data)).toEqual({
			"winners 1": Array(4).fill(undefined),
			"winners 2": Array(2).fill(undefined),
			"winners 3": [{ winner: 1, loser: null }],
			"losers 1": Array(2).fill(undefined),
			"losers 2": Array(2).fill(undefined),
			"losers 3": [undefined],
			"losers 4": [{ winner: 2, loser: 3 }],
		});
	});
});

function created(teamCount: number, settings: BracketSettings = {}) {
	return Engine.create({
		type: "double_elimination",
		seeding: teamIds(teamCount),
		settings,
	});
}

function progression(
	settings: BracketSettings,
	destinations: [name: string, placements: number[]][],
): TournamentSettings["bracketProgression"] {
	return [
		{ ...MAIN, settings },
		...destinations.map(([name, placements]) => ({
			type: "single_elimination" as const,
			name,
			requiresCheckIn: false,
			settings: {},
			sources: [{ bracketIdx: 0, placements }],
		})),
	];
}

function mainBracket(
	data: BracketData,
	settings: BracketSettings = {},
	destinations: [name: string, placements: number[]][] = [],
) {
	return testTournament({
		ctx: {
			settings: { bracketProgression: progression(settings, destinations) },
		},
		data,
	}).bracketByIdx(0)!;
}

function isFinals(data: BracketData, roundId: number) {
	return data.round.find((round) => round.id === roundId)?.section === "finals";
}

/** [team id, placement] of the best placed teams. */
function top(bracket: ReturnType<typeof mainBracket>, count: number) {
	return bracket.standings
		.slice(0, count)
		.map((standing) => [standing.team.id, standing.placement]);
}

function bestOfsBySection(counts: BracketMapCounts) {
	return R.mapValues(
		{ winners: "0:winners", losers: "0:losers", finals: "0:finals" },
		(key) =>
			[...(counts.get(key)?.entries() ?? [])]
				.toSorted(([a], [b]) => a - b)
				.map(([, { count }]) => count),
	);
}
