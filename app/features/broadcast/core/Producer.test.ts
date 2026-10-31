import { describe, expect, test } from "vitest";
import * as Producer from "./Producer";

describe("Producer.take", () => {
	test("puts the staged state on air and stages the following scene with the same transition and colors", () => {
		const taken = Producer.take(
			{
				takeId: 3,
				live: {
					scene: "rosters",
					swapSides: false,
					transition: "cut",
					ink: null,
				},
				next: {
					scene: "game",
					swapSides: true,
					transition: "stinger",
					ink: { key: "lockYellowPurple", isFlipped: false },
				},
				liveResults: { matchId: 1, count: 1 },
			},
			{ matchId: 1, count: 2 },
		);

		expect(taken).toEqual({
			takeId: 4,
			live: {
				scene: "game",
				swapSides: true,
				transition: "stinger",
				ink: { key: "lockYellowPurple", isFlipped: false },
			},
			next: {
				scene: "rosters",
				swapSides: true,
				transition: "stinger",
				ink: { key: "lockYellowPurple", isFlipped: false },
			},
			liveResults: { matchId: 1, count: 2 },
		});
	});
});
