import { describe, expect, test } from "vitest";
import type { DetectedEvent } from "../../core/detectors/types";
import {
	X_RANK_POSITION_EVENT_TYPE,
	type XRankPositionData,
} from "../../core/detectors/x-rank/position";
import {
	X_SET_COUNT_EVENT_TYPE,
	type XSetCountData,
} from "../../core/detectors/x-rank/set-count";
import {
	X_SET_RESULT_EVENT_TYPE,
	type XSetResultData,
} from "../../core/detectors/x-rank/set-result";
import { TimelineBuilder } from "../../core/timeline/index";

const SET_RESULTS: XSetResultData["results"] = [
	"LOSE",
	"LOSE",
	"WIN",
	"WIN",
	"LOSE",
];

describe("TimelineBuilder X Battle cards", () => {
	test("keeps the set count the digits flip to, not the stale score the card opens on", () => {
		const timeline = new TimelineBuilder();
		for (const [t, wins] of [
			[0, 1],
			[0.2, 1],
			[0.4, 1],
			[1.6, 2],
			[1.8, 2],
		] as const) {
			timeline.push(count(t, 0.95, { wins, losses: 2 }));
		}

		expect(timeline.events.map((e) => e.data)).toEqual([
			{ mode: "TC", wins: 2, losses: 2 },
		]);
	});

	test("keeps the flipped set count when a stale read arrives later and more confident", () => {
		const timeline = new TimelineBuilder();
		timeline.push(count(1.6, 0.86, { wins: 2, losses: 2 }));

		const action = timeline.push(count(0.2, 0.97, { wins: 1, losses: 2 }));

		expect(action.action).toBe("merged");
		expect(timeline.events[0]!.data).toMatchObject({ wins: 2 });
	});

	test("keeps the X Power the card counts down to", () => {
		const timeline = new TimelineBuilder();
		for (const [t, powerChange, power] of [
			[0, null, 2752.4],
			[0.8, -29.2, 2752.4],
			[1.3, -29.2, 2742.6],
			[1.4, -29.2, 2728.0],
			[1.5, -29.2, 2723.2],
			[1.6, -29.2, 2723.2],
		] as const) {
			timeline.push(result(t, { powerChange, power }));
		}

		expect(timeline.events.map((e) => e.data)).toMatchObject([
			{ powerChange: -29.2, power: 2723.2 },
		]);
	});

	test("ignores an X Power read further away than the whole change", () => {
		const timeline = new TimelineBuilder();
		timeline.push(result(1.4, { powerChange: -29.2, power: 2728.0 }));

		const action = timeline.push(
			result(1.5, { powerChange: -29.2, power: 2228.0 }),
		);

		expect(action.action).toBe("merged");
		expect(timeline.events[0]!.data).toMatchObject({ power: 2728.0 });
	});

	test.each([
		{ direction: "DOWN", positions: [203, 226, 254, 259], expected: 259 },
		{ direction: "UP", positions: [480, 431, 402, 398], expected: 398 },
	] as const)(
		"keeps the position the $direction arrow counts to",
		({ direction, positions, expected }) => {
			const timeline = new TimelineBuilder();
			for (const [i, position] of positions.entries()) {
				timeline.push(rankPosition(i * 0.1, { position, direction }));
			}

			expect(timeline.events.map((e) => e.data)).toMatchObject([
				{ position: expected },
			]);
		},
	);
});

function count(
	t: number,
	confidence: number,
	data: Omit<XSetCountData, "mode">,
): DetectedEvent {
	return {
		type: X_SET_COUNT_EVENT_TYPE,
		t,
		confidence,
		data: { mode: "TC", ...data } satisfies XSetCountData,
	};
}

function result(
	t: number,
	data: Pick<XSetResultData, "powerChange" | "power">,
): DetectedEvent {
	return {
		type: X_SET_RESULT_EVENT_TYPE,
		t,
		confidence: 0.94,
		data: {
			mode: "TC",
			results: SET_RESULTS,
			...data,
		} satisfies XSetResultData,
	};
}

function rankPosition(
	t: number,
	data: Omit<XRankPositionData, "mode">,
): DetectedEvent {
	return {
		type: X_RANK_POSITION_EVENT_TYPE,
		t,
		confidence: 0.94,
		data: { mode: "TC", ...data } satisfies XRankPositionData,
	};
}
