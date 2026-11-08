import { describe, expect, test } from "vitest";
import * as SetProgress from "./SetProgress";

const results = [
	{ winnerTeamId: 1, mode: "SZ", stageId: 1 },
	{ winnerTeamId: 2, mode: "TC", stageId: 2 },
	{ winnerTeamId: 1, mode: "RM", stageId: 3 },
] as const;

const progressAt = (resultCount: number, isSetOver = false) =>
	SetProgress.atResultCount({
		results: [...results],
		resultCount,
		teamIds: [1, 2],
		bracketScores: [2, 1],
		isSetOver,
		plannedMaps: [
			{ mode: "SZ", stageId: 1 },
			{ mode: "TC", stageId: 2 },
			{ mode: "RM", stageId: 3 },
			{ mode: "CB", stageId: 4 },
		],
		gameCount: 5,
	});

describe("SetProgress.atResultCount", () => {
	test("counts the score from the first results only", () => {
		expect(progressAt(2)).toEqual({
			resultCount: 2,
			scores: [1, 1],
			isOver: false,
			gameNumber: 3,
			currentMap: { mode: "RM", stageId: 3 },
			games: [
				{ map: { mode: "SZ", stageId: 1 }, winner: 0 },
				{ map: { mode: "TC", stageId: 2 }, winner: 1 },
				{ map: { mode: "RM", stageId: 3 }, winner: null },
				{ map: { mode: "CB", stageId: 4 }, winner: null },
				{ map: null, winner: null },
			],
		});
	});

	test("takes the bracket's scores once every result is counted", () => {
		expect(
			SetProgress.atResultCount({
				results: [...results],
				resultCount: 3,
				teamIds: [1, 2],
				bracketScores: [0, 3],
				isSetOver: true,
				plannedMaps: [],
				gameCount: 5,
			}).scores,
		).toEqual([0, 3]);
	});

	test("shows the upcoming map after the last reported result", () => {
		expect(progressAt(3).currentMap).toEqual({ mode: "CB", stageId: 4 });
	});

	test("leaves the games the set ended before without a map", () => {
		expect(progressAt(3, true).games.slice(3)).toEqual([
			{ map: null, winner: null },
			{ map: null, winner: null },
		]);
	});

	test("is over only once the final result is counted", () => {
		expect(progressAt(2, true).isOver).toBe(false);
		expect(progressAt(3, true)).toMatchObject({
			isOver: true,
			gameNumber: 3,
			currentMap: null,
		});
	});

	test.each([
		{ why: "more than reported", resultCount: 10, expected: 3 },
		{ why: "negative", resultCount: -1, expected: 0 },
	])("caps a count that is $why", ({ resultCount, expected }) => {
		expect(progressAt(resultCount).resultCount).toBe(expected);
	});
});

describe("SetProgress.winner", () => {
	test.each([
		{ why: "set going", scores: [2, 0], isOver: false, expected: null },
		{ why: "first team won", scores: [3, 1], isOver: true, expected: 0 },
		{ why: "second team won", scores: [0, 3], isOver: true, expected: 1 },
		{ why: "a play all tie", scores: [2, 2], isOver: true, expected: null },
	] as const)("$why", ({ scores, isOver, expected }) => {
		expect(SetProgress.winner({ scores: [...scores], isOver })).toBe(expected);
	});
});

describe("SetProgress.liveResultCount", () => {
	test.each([
		{ why: "nothing taken yet", liveResults: null, expected: 3 },
		{
			why: "another match taken",
			liveResults: { matchId: 2, count: 1 },
			expected: 3,
		},
		{
			why: "this match taken",
			liveResults: { matchId: 1, count: 1 },
			expected: 1,
		},
		{
			why: "a result undone since",
			liveResults: { matchId: 1, count: 5 },
			expected: 3,
		},
	])("$why", ({ liveResults, expected }) => {
		expect(
			SetProgress.liveResultCount({ liveResults, matchId: 1, resultCount: 3 }),
		).toBe(expected);
	});
});

describe("SetProgress.gamesUntilDecided", () => {
	const bestOf5 = { count: 5, countType: "BEST_OF" } as const;
	const gamesWon = (...winners: Array<0 | 1 | null>) =>
		winners.map((winner) => ({ map: null, winner }));
	const progressWith = ({
		winners,
		gameNumber,
		isOver = false,
	}: {
		winners: Array<0 | 1 | null>;
		gameNumber: number;
		isOver?: boolean;
	}) => ({
		resultCount: winners.filter((winner) => winner !== null).length,
		scores: [0, 0] as [number, number],
		isOver,
		gameNumber,
		currentMap: null,
		games: gamesWon(...winners),
	});

	test.each([
		{
			why: "the set is still open",
			progress: progressWith({
				winners: [0, 1, null, null, null],
				gameNumber: 3,
			}),
			currentWinner: 0 as const,
			expected: 5,
		},
		{
			why: "the game being played clinches the set",
			progress: progressWith({
				winners: [0, 0, null, null, null],
				gameNumber: 3,
			}),
			currentWinner: 0 as const,
			expected: 3,
		},
		{
			why: "the clinching result is reported",
			progress: progressWith({
				winners: [0, 1, 1, 1, null],
				gameNumber: 4,
				isOver: true,
			}),
			currentWinner: null,
			expected: 4,
		},
		{
			why: "an admin ended the set early",
			progress: progressWith({
				winners: [0, null, null, null, null],
				gameNumber: 1,
				isOver: true,
			}),
			currentWinner: null,
			expected: 1,
		},
		{
			why: "the game being played has no result yet",
			progress: progressWith({
				winners: [0, 0, null, null, null],
				gameNumber: 3,
			}),
			currentWinner: null,
			expected: 5,
		},
	])(
		"leaves $expected games when $why",
		({ progress, currentWinner, expected }) => {
			expect(
				SetProgress.gamesUntilDecided({
					progress,
					match: bestOf5,
					currentWinner,
				}),
			).toHaveLength(expected);
		},
	);

	test("keeps every game of a play all set", () => {
		expect(
			SetProgress.gamesUntilDecided({
				progress: progressWith({ winners: [0, 0, null], gameNumber: 3 }),
				match: { count: 3, countType: "PLAY_ALL" },
				currentWinner: 0,
			}),
		).toHaveLength(3);
	});
});
