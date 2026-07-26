import { describe, expect, test } from "vitest";
import { matchEndedEarly } from "./status";

describe("matchEndedEarly", () => {
	test("returns false when no winner", () => {
		expect(
			matchEndedEarly({
				opponentOne: { score: 1 },
				opponentTwo: { score: 1 },
				winnerSide: null,
				count: 3,
				countType: "BEST_OF",
			}),
		).toBe(false);
	});

	test("returns false when match completed normally (best of 3)", () => {
		expect(
			matchEndedEarly({
				opponentOne: { score: 2 },
				opponentTwo: { score: 1 },
				winnerSide: "opponent1",
				count: 3,
				countType: "BEST_OF",
			}),
		).toBe(false);
	});

	test("returns true when match ended early (best of 3)", () => {
		expect(
			matchEndedEarly({
				opponentOne: { score: 1 },
				opponentTwo: { score: 0 },
				winnerSide: "opponent1",
				count: 3,
				countType: "BEST_OF",
			}),
		).toBe(true);
	});

	test("returns true when match ended early (best of 5)", () => {
		expect(
			matchEndedEarly({
				opponentOne: { score: 2 },
				opponentTwo: { score: 1 },
				winnerSide: "opponent1",
				count: 5,
				countType: "BEST_OF",
			}),
		).toBe(true);
	});

	test("returns false when match completed normally (best of 5)", () => {
		expect(
			matchEndedEarly({
				opponentOne: { score: 3 },
				opponentTwo: { score: 2 },
				winnerSide: "opponent1",
				count: 5,
				countType: "BEST_OF",
			}),
		).toBe(false);
	});

	test("returns false when all maps played (play all)", () => {
		expect(
			matchEndedEarly({
				opponentOne: { score: 2 },
				opponentTwo: { score: 1 },
				winnerSide: "opponent1",
				count: 3,
				countType: "PLAY_ALL",
			}),
		).toBe(false);
	});

	test("returns true when not all maps played (play all)", () => {
		expect(
			matchEndedEarly({
				opponentOne: { score: 2 },
				opponentTwo: { score: 0 },
				winnerSide: "opponent1",
				count: 3,
				countType: "PLAY_ALL",
			}),
		).toBe(true);
	});

	test("handles missing scores as 0", () => {
		expect(
			matchEndedEarly({
				opponentOne: {},
				opponentTwo: {},
				winnerSide: "opponent1",
				count: 3,
				countType: "BEST_OF",
			}),
		).toBe(true);
	});
});
