import { describe, expect, it } from "vitest";
import { matchCensorLevel } from "./useBracketSpoilerCensor";

const BASE_ARGS = {
	censored: true,
	roundNumber: 1,
	roundIdx: 0,
} as const;

describe("matchCensorLevel()", () => {
	it("returns undefined when not censored", () => {
		expect(
			matchCensorLevel({
				...BASE_ARGS,
				censored: false,
				bracketType: "double_elimination",
			}),
		).toBeUndefined();
	});

	it("returns 'score-only' for DE winners round 1", () => {
		expect(
			matchCensorLevel({
				...BASE_ARGS,
				bracketType: "double_elimination",
				matchType: "winners",
			}),
		).toBe("score-only");
	});

	it("returns 'full' for DE winners round 2+", () => {
		expect(
			matchCensorLevel({
				...BASE_ARGS,
				bracketType: "double_elimination",
				matchType: "winners",
				roundIdx: 1,
				roundNumber: 2,
			}),
		).toBe("full");
	});

	it("returns 'full' for DE losers round", () => {
		expect(
			matchCensorLevel({
				...BASE_ARGS,
				bracketType: "double_elimination",
				matchType: "losers",
			}),
		).toBe("full");
	});

	it("returns 'score-only' for swiss round 1", () => {
		expect(
			matchCensorLevel({
				...BASE_ARGS,
				bracketType: "swiss",
			}),
		).toBe("score-only");
	});

	it("returns 'full' for swiss round 2+", () => {
		expect(
			matchCensorLevel({
				...BASE_ARGS,
				bracketType: "swiss",
				roundNumber: 2,
				roundIdx: 1,
			}),
		).toBe("full");
	});

	it("returns 'score-only' for round robin", () => {
		expect(
			matchCensorLevel({
				...BASE_ARGS,
				bracketType: "round_robin",
			}),
		).toBe("score-only");
	});
});
