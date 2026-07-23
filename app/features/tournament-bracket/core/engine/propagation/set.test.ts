import { describe, expect, test } from "vitest";
import { matchEndedEarly } from "./set";

describe("matchEndedEarly", () => {
	test("returns false when no winner", () => {
		expect(
			matchEndedEarly({
				opponentOne: { score: 1 },
				opponentTwo: { score: 1 },
				count: 3,
				countType: "BEST_OF",
			}),
		).toBe(false);
	});

	test("returns false when match completed normally (best of 3)", () => {
		expect(
			matchEndedEarly({
				opponentOne: { score: 2, result: "win" },
				opponentTwo: { score: 1, result: "loss" },
				count: 3,
				countType: "BEST_OF",
			}),
		).toBe(false);
	});

	test("returns true when match ended early (best of 3)", () => {
		expect(
			matchEndedEarly({
				opponentOne: { score: 1, result: "win" },
				opponentTwo: { score: 0, result: "loss" },
				count: 3,
				countType: "BEST_OF",
			}),
		).toBe(true);
	});

	test("returns true when match ended early (best of 5)", () => {
		expect(
			matchEndedEarly({
				opponentOne: { score: 2, result: "win" },
				opponentTwo: { score: 1, result: "loss" },
				count: 5,
				countType: "BEST_OF",
			}),
		).toBe(true);
	});

	test("returns false when match completed normally (best of 5)", () => {
		expect(
			matchEndedEarly({
				opponentOne: { score: 3, result: "win" },
				opponentTwo: { score: 2, result: "loss" },
				count: 5,
				countType: "BEST_OF",
			}),
		).toBe(false);
	});

	test("returns false when all maps played (play all)", () => {
		expect(
			matchEndedEarly({
				opponentOne: { score: 2, result: "win" },
				opponentTwo: { score: 1, result: "loss" },
				count: 3,
				countType: "PLAY_ALL",
			}),
		).toBe(false);
	});

	test("returns true when not all maps played (play all)", () => {
		expect(
			matchEndedEarly({
				opponentOne: { score: 2, result: "win" },
				opponentTwo: { score: 0, result: "loss" },
				count: 3,
				countType: "PLAY_ALL",
			}),
		).toBe(true);
	});

	test("handles missing scores as 0", () => {
		expect(
			matchEndedEarly({
				opponentOne: { result: "win" },
				opponentTwo: { result: "loss" },
				count: 3,
				countType: "BEST_OF",
			}),
		).toBe(true);
	});
});
