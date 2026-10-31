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

describe("SetProgress.isOnMatchPoint", () => {
	test.each([
		{ why: "one win away", scores: [2, 1], expected: [true, false] },
		{ why: "both one win away", scores: [2, 2], expected: [true, true] },
		{ why: "neither one win away", scores: [1, 0], expected: [false, false] },
	] as const)("$why", ({ scores, expected }) => {
		expect(
			SetProgress.isOnMatchPoint(
				{ countType: "BEST_OF", count: 5 },
				{ scores: [...scores], isOver: false },
			),
		).toEqual(expected);
	});

	test("has no match point in a play all set", () => {
		expect(
			SetProgress.isOnMatchPoint(
				{ countType: "PLAY_ALL", count: 3 },
				{ scores: [1, 1], isOver: false },
			),
		).toEqual([false, false]);
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
