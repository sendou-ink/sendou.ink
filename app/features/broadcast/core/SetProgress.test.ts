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
		upcomingMap: { mode: "CB", stageId: 4 },
	});

describe("SetProgress.atResultCount", () => {
	test("counts the score from the first results only", () => {
		expect(progressAt(2)).toEqual({
			resultCount: 2,
			scores: [1, 1],
			isOver: false,
			gameNumber: 3,
			currentMap: { mode: "RM", stageId: 3 },
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
				upcomingMap: null,
			}).scores,
		).toEqual([0, 3]);
	});

	test("shows the upcoming map after the last reported result", () => {
		expect(progressAt(3).currentMap).toEqual({ mode: "CB", stageId: 4 });
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
