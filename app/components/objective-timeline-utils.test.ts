import { describe, expect, test } from "vitest";
import {
	matchScoresFromObjective,
	type ObjectiveScoreRead,
	type PenaltyRead,
	smoothPenalties,
} from "./objective-timeline-utils";

function reads(...pairs: Array<[t: number, penalty: number | null]>) {
	return pairs.map(([t, penalty]): PenaltyRead => ({ t, penalty }));
}

function counterReads(
	...entries: Array<[t: number, alpha: number | null, bravo: number | null]>
) {
	return entries.map(
		([t, alpha, bravo]): ObjectiveScoreRead => ({ t, score: [alpha, bravo] }),
	);
}

describe("smoothPenalties", () => {
	test("passes steady reads through", () => {
		expect(smoothPenalties(reads([0, 10], [2, 10], [4, 10]))).toEqual([
			10, 10, 10,
		]);
	});

	test("median-filters an isolated dropped-digit misread", () => {
		expect(smoothPenalties(reads([0, 36], [2, 6], [4, 36]))).toEqual([
			36, 36, 36,
		]);
	});

	test("bridges a short null gap with the previous value", () => {
		expect(smoothPenalties(reads([0, 12], [2, null], [4, 12]))).toEqual([
			12, 12, 12,
		]);
	});

	test("does not bridge a gap longer than the bridge window", () => {
		expect(
			smoothPenalties(reads([0, 12], [1, 12], [20, null], [40, 8], [41, 8])),
		).toEqual([12, 12, null, 8, 8]);
	});

	test("drops one-off reads with no nearby confirmation", () => {
		expect(smoothPenalties(reads([0, 5], [30, 12], [60, 7]))).toEqual([
			null,
			null,
			null,
		]);
	});

	test("does not extend past the last read", () => {
		expect(smoothPenalties(reads([0, 10], [2, 10], [4, null]))).toEqual([
			10,
			10,
			null,
		]);
	});

	test("keeps all-null reads null", () => {
		expect(smoothPenalties(reads([0, null], [2, null]))).toEqual([null, null]);
	});
});

describe("matchScoresFromObjective", () => {
	test("inverts the last counter read of each team", () => {
		expect(
			matchScoresFromObjective(
				counterReads([0, 100, 100], [60, 80, 92], [120, 55, 0]),
			),
		).toEqual([45, 100]);
	});

	test("falls back to the latest readable count", () => {
		expect(
			matchScoresFromObjective(
				counterReads([0, 100, 100], [60, 55, 40], [120, null, null]),
			),
		).toEqual([45, 60]);
	});

	test("ignores counts outside the counter's range", () => {
		expect(
			matchScoresFromObjective(counterReads([0, 100, 100], [60, 155, 40])),
		).toEqual([0, 60]);
	});

	test("reads the last count regardless of the order given", () => {
		expect(
			matchScoresFromObjective(
				counterReads([120, 55, 0], [0, 100, 100], [60, 80, 92]),
			),
		).toEqual([45, 100]);
	});

	test("reports nothing when no count was read", () => {
		expect(matchScoresFromObjective(counterReads([0, null, null]))).toEqual([
			null,
			null,
		]);
		expect(matchScoresFromObjective([])).toEqual([null, null]);
	});
});
