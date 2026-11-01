import { describe, expect, test } from "vitest";
import * as Producer from "./Producer";

const ink = {
	key: "lockYellowPurple",
	isFlipped: false,
	matchId: 1,
	resultCount: 1,
} as const;

describe("Producer.take", () => {
	test("puts the staged state on air and stages the following scene with the same transition, keeping the ink colors", () => {
		const taken = Producer.take(
			{
				takeId: 3,
				live: {
					scene: "rosters",
					swapSides: false,
					transition: "cut",
				},
				next: {
					scene: "game",
					swapSides: true,
					transition: "stinger",
				},
				liveResults: { matchId: 1, count: 1 },
				ink,
			},
			{ matchId: 1, count: 2 },
		);

		expect(taken).toEqual({
			takeId: 4,
			live: {
				scene: "game",
				swapSides: true,
				transition: "stinger",
			},
			next: {
				scene: "rosters",
				swapSides: true,
				transition: "stinger",
			},
			liveResults: { matchId: 1, count: 2 },
			ink,
		});
	});
});
