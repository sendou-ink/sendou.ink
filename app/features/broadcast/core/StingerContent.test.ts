import { describe, expect, test } from "vitest";
import type { MatchProgress } from "../broadcast-types";
import * as StingerContent from "./StingerContent";

const bo5 = { countType: "BEST_OF", count: 5 } as const;

const progress = (overrides: Partial<MatchProgress> = {}): MatchProgress => ({
	resultCount: 1,
	scores: [1, 0],
	isOver: false,
	gameNumber: 2,
	currentMap: { mode: "SZ", stageId: 1 },
	games: [],
	...overrides,
});

describe("StingerContent.resolve", () => {
	test("headlines the upcoming game going into the game", () => {
		expect(
			StingerContent.resolve({
				scene: "game",
				match: bo5,
				progress: progress(),
			}),
		).toEqual({
			kind: "game",
			gameNumber: 2,
			map: { mode: "SZ", stageId: 1 },
			stakes: null,
		});
	});

	test.each([
		{
			why: "a team one win away",
			overrides: { scores: [2, 1], gameNumber: 4 },
			expected: "match-point",
		},
		{
			why: "the last game of the set",
			overrides: { scores: [2, 2], gameNumber: 5 },
			expected: "final-game",
		},
	] as const)("tells the stakes of $why", ({ overrides, expected }) => {
		const content = StingerContent.resolve({
			scene: "game",
			match: bo5,
			progress: progress({ ...overrides, scores: [...overrides.scores] }),
		});

		expect(content).toMatchObject({ kind: "game", stakes: expected });
	});

	test("headlines the winner once the set is over", () => {
		expect(
			StingerContent.resolve({
				scene: "rosters",
				match: bo5,
				progress: progress({ scores: [1, 3], isOver: true }),
			}),
		).toEqual({ kind: "result", winner: 1 });
	});

	test("headlines the scene without a match", () => {
		expect(
			StingerContent.resolve({ scene: "break", match: null, progress: null }),
		).toEqual({ kind: "scene", scene: "break" });
	});

	test("headlines the matchup going into the rosters", () => {
		expect(
			StingerContent.resolve({
				scene: "rosters",
				match: bo5,
				progress: progress(),
			}),
		).toEqual({ kind: "matchup" });
	});
});
