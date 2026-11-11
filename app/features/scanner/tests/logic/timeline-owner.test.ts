import { describe, expect, test } from "vitest";
import type { PlayerStatusData } from "../../core/detectors/objective/player-status";
import type { DetectedEvent, EventType } from "../../core/events";
import {
	changeOf,
	stitchLanes,
	TimelineBuilder,
} from "../../core/timeline/index";
import { stubEvent } from "../stub-event";

describe("TimelineBuilder slot keys", () => {
	test("gives every added event a key of its own", () => {
		const timeline = new TimelineBuilder();

		const first = timeline.push(scoreboard(0, 0.8));
		const second = timeline.push(scoreboard(100, 0.8));

		expect(keyOf(first)).not.toBe(keyOf(second));
	});

	test("hands a replaced event's key to the event replacing it", () => {
		const timeline = new TimelineBuilder();
		const added = timeline.push(scoreboard(0, 0.8));

		const replaced = timeline.push(scoreboard(1, 0.9));

		expect(replaced.action).toBe("replaced");
		expect(keyOf(replaced)).toBe(keyOf(added));
	});

	test("keeps a run's trailing read in one slot as the run extends", () => {
		const timeline = new TimelineBuilder();
		const start = timeline.push(status(100));
		const trailing = timeline.push(status(101));

		const extended = timeline.push(status(102));

		expect(extended.action).toBe("extended");
		expect(keyOf(extended)).toBe(keyOf(trailing));
		expect(keyOf(extended)).not.toBe(keyOf(start));
	});
});

describe("changeOf", () => {
	test("reports a kept read with its slot and no replaced event", () => {
		const timeline = new TimelineBuilder();
		timeline.push(scoreboard(0, 0.8));
		const better = scoreboard(1, 0.9);

		expect(changeOf(timeline.push(better))).toEqual({
			action: "replaced",
			key: 0,
			event: better,
		});
	});

	test.each([
		{ why: "merged", confidence: 0.7 },
		{ why: "dropped", confidence: 0.1 },
	])("is null for a $why read", ({ confidence }) => {
		const timeline = new TimelineBuilder();
		timeline.push(scoreboard(0, 0.8));

		expect(changeOf(timeline.push(scoreboard(1, confidence)))).toBeNull();
	});
});

describe("stitchLanes", () => {
	test("merges a screen read on both sides of a seam into its most confident read", () => {
		const before = scoreboard(99, 0.8);
		const after = scoreboard(101, 0.9);

		const stitched = stitchLanes([
			{ tStart: 0, events: [before] },
			{ tStart: 100, events: [after] },
		]);

		expect(stitched).toEqual([after]);
	});

	test("lets the earlier lane's read replace a less confident one after the seam", () => {
		const before = scoreboard(99, 0.9);
		const after = scoreboard(101, 0.8);

		const stitched = stitchLanes([
			{ tStart: 0, events: [before] },
			{ tStart: 100, events: [after] },
		]);

		expect(stitched).toEqual([before]);
	});

	test("continues a status run across a seam", () => {
		const stitched = stitchLanes([
			{ tStart: 0, events: [status(96), status(99)] },
			{ tStart: 100, events: [status(100), status(103)] },
		]);

		expect(stitched.map((event) => event.t)).toEqual([96, 100, 103]);
	});

	test("leaves what a lane held away from the seam as it is", () => {
		const events = [scoreboard(10, 0.8), scoreboard(20, 0.9)];

		const stitched = stitchLanes([
			{ tStart: 0, events },
			{ tStart: 100, events: [scoreboard(140, 0.9)] },
		]);

		expect(stitched.map((event) => event.t)).toEqual([10, 20, 140]);
	});

	test("keeps reads on either side of a seam that no read across it matches", () => {
		const stitched = stitchLanes([
			{ tStart: 0, events: [scoreboard(99, 0.8)] },
			{ tStart: 100, events: [status(100)] },
			{ tStart: 200, events: [] },
		]);

		expect(stitched.map((event) => event.type)).toEqual([
			"Scoreboard",
			"PlayerStatus",
		]);
	});

	test("reports a read carrying data over with the read it was made from", () => {
		const before = setResult(99.5, { powerChange: 20, power: 2000 });
		const after = setResult(100.2, { powerChange: null, power: null });
		const carried: [DetectedEvent, DetectedEvent][] = [];

		const stitched = stitchLanes(
			[
				{ tStart: 0, events: [before] },
				{ tStart: 100, events: [after] },
			],
			(event, from) => carried.push([event, from]),
		);

		expect(stitched).toHaveLength(1);
		expect(stitched[0]).not.toBe(before);
		expect(carried).toEqual([[stitched[0], before]]);
	});
});

function keyOf(action: ReturnType<TimelineBuilder["push"]>): number | null {
	return changeOf(action)?.key ?? null;
}

function scoreboard(
	t: number,
	confidence: number,
	type: EventType = "Scoreboard",
): DetectedEvent {
	return stubEvent({ type, t, confidence, data: { t, players: [] } });
}

function status(t: number): DetectedEvent {
	const none: [boolean, boolean, boolean, boolean] = [
		false,
		false,
		false,
		false,
	];
	const data: PlayerStatusData = {
		time: null,
		special: [none, none],
		dead: [none, none],
		cast: null,
	};
	return { type: "PlayerStatus", t, confidence: 0.8, data };
}

function setResult(
	t: number,
	data: { powerChange: number | null; power: number | null },
): DetectedEvent {
	return {
		type: "XSetResult",
		t,
		confidence: 0.9,
		data: {
			mode: "TC",
			results: ["LOSE", "LOSE", "WIN", "WIN", "LOSE"],
			...data,
		},
	};
}
