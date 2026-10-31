import { describe, expect, test } from "vitest";
import * as Producer from "./Producer";

describe("Producer.take", () => {
	test("puts the staged state on air and stages the following scene", () => {
		const taken = Producer.take(
			{
				takeId: 3,
				live: { scene: "rosters", swapSides: false },
				next: { scene: "game", swapSides: true },
				liveResults: { matchId: 1, count: 1 },
			},
			{ matchId: 1, count: 2 },
		);

		expect(taken).toEqual({
			takeId: 4,
			live: { scene: "game", swapSides: true },
			next: { scene: "rosters", swapSides: true },
			liveResults: { matchId: 1, count: 2 },
		});
	});
});
