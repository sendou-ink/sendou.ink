import { describe, expect, test } from "vitest";
import type { ObjectiveTimelineEvent } from "./ObjectiveTimeline";
import {
	matchScoresFromObjective,
	type ObjectiveScoreRead,
	type PenaltyRead,
	smoothPenalties,
	withFullCountsAtGameStart,
	withUnpushedTrackCounts,
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

	test("keeps a steady value re-confirmed by sparse reads", () => {
		expect(smoothPenalties(reads([0, 10], [14, 10], [27, 10]))).toEqual([
			10, 10, 10,
		]);
	});

	test("bridges a null gap of any length between equal values", () => {
		expect(
			smoothPenalties(reads([0, 10], [15, 10], [30, null], [50, 10])),
		).toEqual([10, 10, 10, 10]);
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

describe("withUnpushedTrackCounts", () => {
	const trackEvent = (alpha: number | null, bravo: number | null) => ({
		data: {
			score: [alpha, bravo] as [number | null, number | null],
			position: 0,
		},
	});

	test("shows a full count until a side's first plate read", () => {
		const scores = withUnpushedTrackCounts([
			trackEvent(null, null),
			trackEvent(90, null),
			trackEvent(null, 70),
			trackEvent(null, null),
		]).map((event) => event.data.score);

		expect(scores).toEqual([
			[100, 100],
			[90, 100],
			[null, 70],
			[null, null],
		]);
	});

	test("leaves splat zones counts alone", () => {
		const events = [
			{ data: { score: [null, null] as [number | null, number | null] } },
			{ data: { score: [90, 80] as [number | null, number | null] } },
		];

		expect(withUnpushedTrackCounts(events)).toEqual(events);
	});
});

describe("withFullCountsAtGameStart", () => {
	const szEvent = (
		t: number,
		time: number | null,
		alpha: number | null,
		bravo: number | null,
	): ObjectiveTimelineEvent => ({
		t,
		data: {
			time,
			score: [alpha, bravo],
			penalty: [null, null],
			control: null,
		},
	});
	const points = (events: ObjectiveTimelineEvent[]) =>
		events.map((event) => [event.t, ...event.data.score]);

	test("starts the line at a full count when the counter was unread as the clock started", () => {
		// clock started at t=12 (4:52 read at t=20), status reads go back to t=9
		const events = withFullCountsAtGameStart(
			[szEvent(20, 292, 100, 100), szEvent(23, 289, 100, 99)],
			9,
		);

		expect(points(events)).toEqual([
			[12, 100, 100],
			[20, 100, 100],
			[23, 100, 99],
		]);
		expect(events[0]!.data.time).toBe(300);
	});

	test("fills a side's unread counts before its first read", () => {
		const events = withFullCountsAtGameStart(
			[
				szEvent(12, 300, null, null),
				szEvent(15, 297, null, 98),
				szEvent(16, 296, 100, 97),
			],
			12,
		);

		expect(points(events)).toEqual([
			[12, 100, 100],
			[15, 100, 98],
			[16, 100, 97],
		]);
	});

	test("never fills an unread count after the side's first read", () => {
		const events = withFullCountsAtGameStart(
			[
				szEvent(20, 292, 100, 90),
				szEvent(25, 287, null, null),
				szEvent(30, 282, 95, 85),
			],
			20,
		);

		expect(points(events).slice(1)).toEqual([
			[20, 100, 90],
			[25, null, null],
			[30, 95, 85],
		]);
	});

	test("leaves footage that began mid-game alone", () => {
		const events = [szEvent(20, 200, null, 60), szEvent(21, 199, 70, 60)];

		expect(withFullCountsAtGameStart(events, 20)).toEqual(events);
	});

	test("starts a tower control line at the middle of the track", () => {
		const [start] = withFullCountsAtGameStart(
			[
				{
					t: 20,
					data: { ...szEvent(20, 292, 100, 100).data, position: 10 },
				},
			],
			20,
		);

		expect(start!.data.position).toBe(0);
	});
});
