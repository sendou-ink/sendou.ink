import { describe, expect, test } from "vitest";
import * as Clock from "../../core/clock";

/** One read a second from `t` on, the clock reaching 0:00 at `zero`. */
function running(zero: number, from: number, to: number): Clock.ClockRead[] {
	const reads: Clock.ClockRead[] = [];
	for (let t = from; t <= to; t++) reads.push({ t, time: zero - t });
	return reads;
}

function spanSummary(spans: Clock.ClockSpan[]) {
	return spans.map(({ zero, from, to, live }) => ({ zero, from, to, live }));
}

describe("Clock.track", () => {
	test("anchors once the clock is seen running", () => {
		expect(spanSummary(Clock.track(running(300, 60, 63)))).toEqual([
			{ zero: 300, from: 60, to: 63, live: true },
		]);
	});

	test.each([
		{ why: "a single read", reads: [{ t: 60, time: 240 }] },
		{
			why: "a display that never moves",
			reads: [
				{ t: 10, time: 300 },
				{ t: 11, time: 300 },
				{ t: 12, time: 300 },
			],
		},
		{ why: "unread timers", reads: [{ t: 10, time: null }] },
	])("no span from $why", ({ reads }) => {
		expect(Clock.track(reads)).toEqual([]);
	});

	test("the full clock held before the start belongs to the game's anchor", () => {
		const spans = Clock.track([
			{ t: 10, time: 300 },
			{ t: 11, time: 300 },
			{ t: 12, time: 300 },
			...running(313, 14, 16),
		]);
		expect(spanSummary(spans)).toEqual([
			{ zero: 313, from: 10, to: 16, live: true },
		]);
		expect(spans[0]!.reads).toBe(6);
	});

	test("0:01 held through overtime stays on the anchor", () => {
		const spans = Clock.track([
			...running(300, 296, 299),
			{ t: 305, time: 1 },
			{ t: 320, time: 1 },
			{ t: 321, time: 0 },
		]);
		expect(spanSummary(spans)).toEqual([
			{ zero: 300, from: 296, to: 321, live: true },
		]);
	});

	test("a lone read off the anchor is a misread, not a break", () => {
		const spans = Clock.track([
			...running(300, 60, 61),
			{ t: 62, time: 179 },
			...running(300, 63, 64),
		]);
		expect(spanSummary(spans)).toEqual([
			{ zero: 300, from: 60, to: 64, live: true },
		]);
	});

	test("two reads agreeing on another anchor break it", () => {
		expect(
			spanSummary(
				Clock.track([...running(300, 60, 62), ...running(260, 63, 64)]),
			),
		).toEqual([
			{ zero: 300, from: 60, to: 62, live: true },
			{ zero: 260, from: 63, to: 64, live: true },
		]);
	});

	test("reads showing a moment again are off the live chain, the anchor returning after them", () => {
		const spans = Clock.track([
			...running(300, 60, 70),
			// a replay of 4:00-3:55
			...running(340, 100, 105),
			...running(300, 106, 110),
		]);
		expect(spanSummary(spans)).toEqual([
			{ zero: 300, from: 60, to: 70, live: true },
			{ zero: 340, from: 100, to: 105, live: false },
			{ zero: 300, from: 106, to: 110, live: true },
		]);
	});

	test("the heaviest chain is live, not the first read", () => {
		const spans = Clock.track([
			// a cut ahead the reads start on, then the game they belong to
			...running(200, 50, 52),
			...running(300, 60, 90),
		]);
		expect(spans.map((span) => span.live)).toEqual([false, true]);
	});

	test("of two equally heavy spans that conflict, the earlier is live", () => {
		const spans = Clock.track([
			...running(300, 60, 62),
			// a replay of 3:45-3:43
			...running(340, 100, 102),
			// the footage cuts ahead
			...running(280, 110, 114),
		]);
		expect(spans.map((span) => span.live)).toEqual([true, false, true]);
	});

	test("an anchor returning a second later after a replay is still live play", () => {
		const spans = Clock.track([
			...running(300, 60, 69),
			...running(340, 100, 102),
			// back to live play, frames now landing after the tick
			...running(301, 103, 112),
		]);
		expect(spans.map((span) => span.live)).toEqual([true, false, true]);
	});

	test("reads come in any order", () => {
		expect(spanSummary(Clock.track(running(300, 60, 63).toReversed()))).toEqual(
			[{ zero: 300, from: 60, to: 63, live: true }],
		);
	});
});

describe("Clock.position", () => {
	const spans = Clock.track([
		...running(300, 60, 70),
		...running(340, 100, 105),
		...running(300, 106, 110),
	]);

	test.each([
		{
			why: "a read on the anchor keeps its time",
			read: { t: 65, time: 235 },
			expected: { live: true, time: 235, remaining: 235 },
		},
		{
			why: "a misread takes the anchor's prediction",
			read: { t: 65, time: 135 },
			expected: { live: true, time: 235, remaining: 235 },
		},
		{
			why: "a read between ticks is predicted up to the whole second",
			read: { t: 65.5, time: 135 },
			expected: { live: true, time: 235, remaining: 234.5 },
		},
		{
			why: "an unread timer stays unread",
			read: { t: 65, time: null },
			expected: { live: true, time: null, remaining: 235 },
		},
		{
			why: "a timerless read inside a replay is off the live chain",
			read: { t: 102, time: null },
			expected: { live: false, time: null, remaining: 238 },
		},
		{
			why: "a read in a gap follows the span before it",
			read: { t: 80, time: 50 },
			expected: { live: true, time: 50, remaining: 220 },
		},
		{
			why: "a read before every span follows the first",
			read: { t: 40, time: null },
			expected: { live: true, time: null, remaining: 260 },
		},
	])("$why", ({ read, expected }) => {
		expect(Clock.position(spans, read)).toEqual(expected);
	});

	test("Turf War's 3:00 held before the start keeps its time", () => {
		const turfWar = Clock.track([
			{ t: 10, time: 180 },
			{ t: 11, time: 180 },
			...running(193, 14, 16),
		]);
		expect(spanSummary(turfWar)).toEqual([
			{ zero: 193, from: 10, to: 16, live: true },
		]);
		expect(Clock.position(turfWar, { t: 11, time: 180 })).toEqual({
			live: true,
			time: 180,
			remaining: 182,
		});
	});

	test("a lone 5:00 mid-game is a misread, not a hold", () => {
		const game = Clock.track([
			...running(300, 60, 61),
			{ t: 62, time: 300 },
			...running(300, 63, 64),
		]);
		expect(Clock.position(game, { t: 62, time: 300 })).toEqual({
			live: true,
			time: 238,
			remaining: 238,
		});
	});

	test("no spans leave a read as it is", () => {
		expect(Clock.position([], { t: 10, time: 290 })).toEqual({
			live: true,
			time: 290,
			remaining: null,
		});
	});
});
