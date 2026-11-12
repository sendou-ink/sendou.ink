import { describe, expect, test } from "vitest";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { DeathData } from "../../core/detectors/death/index";
import type { PlayerStatusData } from "../../core/detectors/objective/player-status";
import {
	type DetectedEvent,
	type EventType,
	isComplete,
} from "../../core/events";
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
		const added = timeline.push(intro(0, { mode: "SZ" }));

		const replaced = timeline.push(intro(1, { mode: "SZ", stage: 3 }));

		expect(replaced.action).toBe("replaced");
		expect(keyOf(replaced)).toBe(keyOf(added));
	});

	test("keeps an amended event in its slot", () => {
		const timeline = new TimelineBuilder();
		const added = timeline.push(intro(0, { mode: "SZ", stage: 3 }));

		const amended = timeline.push(intro(1, { mode: "TC" }, 0.95));

		expect(amended.action).toBe("amended");
		expect(keyOf(amended)).toBe(keyOf(added));
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
		timeline.push(intro(0, { mode: "SZ" }));
		const fuller = intro(1, { mode: "SZ", stage: 3 });

		expect(changeOf(timeline.push(fuller))).toEqual({
			action: "replaced",
			key: 0,
			event: fuller,
		});
	});

	test.each([
		{ why: "merged", score: 0.7 },
		{ why: "dropped", score: 0.1 },
	])("is null for a $why read", ({ score }) => {
		const timeline = new TimelineBuilder();
		timeline.push(scoreboard(0, 0.8));

		expect(changeOf(timeline.push(scoreboard(1, score)))).toBeNull();
	});
});

describe("TimelineBuilder field votes", () => {
	test("fills a field the kept read left unread from a later read", () => {
		const timeline = new TimelineBuilder();
		timeline.push(intro(0, { mode: "SZ" }));

		const action = timeline.push(intro(1, { stage: 3 }));

		expect(action.action).toBe("amended");
		expect(timeline.events.map(({ t, data }) => ({ t, data }))).toEqual([
			{ t: 0, data: { mode: "SZ", stage: 3 } },
		]);
	});

	test("takes each field from the reads backing it with the most score, whichever read holds the other fields", () => {
		const timeline = new TimelineBuilder();
		timeline.push(intro(0, { mode: "TC", stage: 3 }, 0.7));
		timeline.push(intro(1, { mode: "SZ", stage: 5 }, 0.65));

		const action = timeline.push(intro(2, { mode: "SZ", stage: 3 }, 0.65));

		expect(action.action).toBe("replaced");
		expect(timeline.events.map(({ t, data }) => ({ t, data }))).toEqual([
			{ t: 2, data: { mode: "SZ", stage: 3 } },
		]);
	});

	test("lets several reads outvote one that scored a field higher", () => {
		const timeline = new TimelineBuilder();
		timeline.push(intro(0, { mode: "TC", stage: 3 }, 0.9));

		timeline.push(intro(1, { mode: "SZ", stage: 3 }, 0.6));
		const second = timeline.push(intro(2, { mode: "SZ", stage: 3 }, 0.6));

		expect(second.action).toBe("replaced");
		expect(timeline.events[0]!.data).toEqual({ mode: "SZ", stage: 3 });
	});

	test("keeps the earlier read's time and unscored data when a later one agrees no better", () => {
		const timeline = new TimelineBuilder();
		const first = intro(0, { mode: "SZ", stage: 3 });
		timeline.push(first);

		const action = timeline.push(intro(1, { mode: "SZ", stage: 3 }, 0.99));

		expect(action).toEqual({ action: "merged", into: first });
		expect(timeline.events).toEqual([first]);
	});

	test("scores an outvoted field at the best read of its winner", () => {
		const timeline = new TimelineBuilder();
		timeline.push(intro(0, { mode: "TC", stage: 3 }, 0.7));

		timeline.push(intro(1, { mode: "SZ" }, 0.9));

		expect(timeline.events[0]!.scores).toEqual({ mode: 0.9, stage: 0.7 });
	});

	test("never lets an unread field outvote a read one", () => {
		const timeline = new TimelineBuilder();
		timeline.push(intro(0, { mode: "SZ", stage: 3 }, 0.7));

		const unread = stubEvent({
			type: "MapStart",
			t: 1,
			scores: { mode: 0.9, stage: 0.95 },
			data: { mode: "SZ", stage: null },
		});

		expect(timeline.push(unread).action).toBe("merged");
		expect(timeline.events[0]!.data).toEqual({ mode: "SZ", stage: 3 });
	});

	test("reports a read that only rescores the kept one once it completes it", () => {
		const timeline = new TimelineBuilder();
		// under the 0.7 a settled intro's lines snap at
		timeline.push(intro(0, { mode: "SZ", stage: 3 }, 0.65));

		const same = timeline.push(intro(1, { mode: "SZ", stage: 3 }, 0.68));
		const completing = timeline.push(intro(2, { mode: "SZ", stage: 3 }, 0.8));
		const later = timeline.push(intro(3, { mode: "SZ", stage: 3 }, 0.9));

		expect(same.action).toBe("merged");
		expect(completing.action).toBe("amended");
		expect(isComplete(timeline.events[0]!)).toBe(true);
		expect(later.action).toBe("merged");
	});

	test("votes fields read as one unit together", () => {
		const timeline = new TimelineBuilder();
		timeline.push(death(0, { weaponId: 40, weaponType: "MAIN" }, 0.7));

		timeline.push(death(1, { weaponId: 6, weaponType: "SPECIAL" }, 0.9));

		expect(timeline.events[0]!.data).toMatchObject({
			weaponId: 6,
			weaponType: "SPECIAL",
		});
	});

	test("forgets the votes of reads an animation has moved past", () => {
		const timeline = new TimelineBuilder();
		timeline.push(rankPosition(0, 300, 0.9));
		timeline.push(rankPosition(0.2, 300, 0.9));

		timeline.push(rankPosition(0.4, 259, 0.7));
		const settled = timeline.push(rankPosition(0.6, 259, 0.7));

		expect(settled.action).toBe("merged");
		expect(timeline.events[0]!.data).toMatchObject({ position: 259 });
	});

	test("starts the votes of a read held from an earlier timeline from that read", () => {
		const held = intro(0, { mode: "TC", stage: 3 }, 0.7);
		const timeline = new TimelineBuilder({}, [held]);

		timeline.pushKept(intro(1, { mode: "SZ", stage: 3 }, 0.8));

		expect(timeline.events[0]!.data).toEqual({ mode: "SZ", stage: 3 });
	});
});

describe("TimelineBuilder.pushKept", () => {
	test("keeps a read under the floor that another timeline already kept", () => {
		const timeline = new TimelineBuilder();

		expect(timeline.push(scoreboard(0, 0.1)).action).toBe("dropped");
		expect(timeline.pushKept(scoreboard(0, 0.1)).action).toBe("added");
	});
});

describe("stitchLanes", () => {
	test("merges a screen read on both sides of a seam into one read", () => {
		const before = intro(99, { mode: "SZ" });
		const after = intro(101, { mode: "SZ", stage: 3 });

		const stitched = stitchLanes([
			{ tStart: 0, events: [before] },
			{ tStart: 100, events: [after] },
		]);

		expect(stitched).toEqual([after]);
	});

	test("lets the earlier lane's read replace one after the seam that holds less", () => {
		const before = intro(99, { mode: "SZ", stage: 3 });
		const after = intro(101, { mode: "SZ" });

		const stitched = stitchLanes([
			{ tStart: 0, events: [before] },
			{ tStart: 100, events: [after] },
		]);

		expect(stitched).toEqual([before]);
	});

	test("reports a read amended across a seam with the read whose time it kept", () => {
		const before = intro(99, { mode: "TC" }, 0.95);
		const after = intro(101, { mode: "SZ", stage: 3 }, 0.7);
		const carried: [DetectedEvent, DetectedEvent][] = [];

		const stitched = stitchLanes(
			[
				{ tStart: 0, events: [before] },
				{ tStart: 100, events: [after] },
			],
			(event, from) => carried.push([event, from]),
		);

		expect(stitched.map(({ t, data }) => ({ t, data }))).toEqual([
			{ t: 101, data: { mode: "TC", stage: 3 } },
		]);
		expect(carried).toEqual([[stitched[0], after]]);
	});

	test("keeps a read under the floor that its lane kept", () => {
		const stitched = stitchLanes([
			{ tStart: 0, events: [scoreboard(99, 0.1)] },
			{ tStart: 100, events: [] },
		]);

		expect(stitched).toHaveLength(1);
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

/** A results screen scored as a whole (under `read`, no field), so its repeats merge without a vote. */
function scoreboard(
	t: number,
	score: number,
	type: EventType = "Scoreboard",
): DetectedEvent {
	return stubEvent({
		type,
		t,
		scores: { read: score },
		data: { t, players: [] },
	});
}

/** An intro read: each line it read scored `score`, a line left out is unread. */
function intro(
	t: number,
	{
		mode = null,
		stage = null,
	}: { mode?: ModeShort | null; stage?: StageId | null },
	score = 0.8,
): DetectedEvent {
	return {
		type: "MapStart",
		t,
		scores: {
			...(mode === null ? null : { mode: score }),
			...(stage === null ? null : { stage: score }),
		},
		data: { mode, stage },
	};
}

function death(
	t: number,
	weapon: Pick<DeathData, "weaponId" | "weaponType">,
	score: number,
): DetectedEvent {
	return {
		type: "Death",
		t,
		scores: { "weaponId,weaponType": score },
		data: { ...weapon, abilities: [], name: null },
	};
}

function rankPosition(
	t: number,
	position: number,
	score: number,
): DetectedEvent {
	return {
		type: "XRankPosition",
		t,
		scores: { position: score },
		data: { mode: "TC", position, direction: "UP" },
	};
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
	return { type: "PlayerStatus", t, scores: { read: 0.8 }, data };
}

function setResult(
	t: number,
	data: { powerChange: number | null; power: number | null },
): DetectedEvent {
	return {
		type: "XSetResult",
		t,
		scores: { read: 0.9 },
		data: {
			mode: "TC",
			results: ["LOSE", "LOSE", "WIN", "WIN", "LOSE"],
			...data,
		},
	};
}
