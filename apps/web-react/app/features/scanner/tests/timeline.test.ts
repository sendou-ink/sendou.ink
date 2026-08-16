import assert from "node:assert/strict";
import type { ScoreboardData } from "../core/detectors/scoreboard/index";
import type { DetectedEvent } from "../core/detectors/types";
import { TimelineBuilder } from "../core/timeline/index";
import test from "./node-test-compat";

function event(
	t: number,
	confidence: number,
	type = "Scoreboard",
): DetectedEvent {
	return { type, t, confidence, data: { t } };
}

/** A ScoreboardBattleLogReplay event with just the identity-relevant data fields. */
function replay(
	t: number,
	confidence: number,
	data: Partial<ScoreboardData> & {
		timestamp?: string | null;
		replayCode?: string | null;
	},
): DetectedEvent {
	return {
		type: "ScoreboardBattleLogReplay",
		t,
		confidence,
		data: {
			lobby: null,
			mode: null,
			stage: null,
			timestamp: null,
			replayCode: null,
			scores: [null, null],
			players: [],
			povIndex: null,
			...data,
		},
	};
}

function players(paints: (number | null)[]): ScoreboardData["players"] {
	return paints.map((paint, i) => ({
		name: `p${i}`,
		weaponId: null,
		paint,
		ka: null,
		d: null,
		s: null,
	}));
}

test("timeline drops low-confidence events", () => {
	const tl = new TimelineBuilder({ minConfidence: 0.6 });
	assert.equal(tl.push(event(0, 0.5)).action, "dropped");
	assert.equal(tl.events.length, 0);
});

test("timeline merges same-type events inside the window", () => {
	const tl = new TimelineBuilder({ mergeWindow: 30, minConfidence: 0 });
	assert.equal(tl.push(event(100, 0.8)).action, "added");
	assert.equal(tl.push(event(110, 0.7)).action, "merged");
	assert.equal(tl.events.length, 1);
	assert.equal(tl.events[0]!.confidence, 0.8);
});

test("timeline keeps the highest-confidence version", () => {
	const tl = new TimelineBuilder({ mergeWindow: 30, minConfidence: 0 });
	tl.push(event(100, 0.7));
	const result = tl.push(event(105, 0.9));
	assert.equal(result.action, "replaced");
	assert.equal(tl.events[0]!.confidence, 0.9);
});

test("timeline keeps separate events outside the window", () => {
	const tl = new TimelineBuilder({ mergeWindow: 30, minConfidence: 0 });
	tl.push(event(100, 0.8));
	assert.equal(tl.push(event(200, 0.8)).action, "added");
	assert.equal(tl.events.length, 2);
});

test("different event types never merge", () => {
	const tl = new TimelineBuilder({ mergeWindow: 30, minConfidence: 0 });
	tl.push(event(100, 0.8, "Scoreboard"));
	assert.equal(tl.push(event(105, 0.8, "Death")).action, "added");
	assert.equal(tl.events.length, 2);
});

test("scoreboards with different stages stay separate inside the window", () => {
	const tl = new TimelineBuilder({ minConfidence: 0 });
	assert.equal(tl.push(replay(100, 0.8, { stage: 21 })).action, "added");
	assert.equal(tl.push(replay(104, 0.8, { stage: 2 })).action, "added");
	assert.equal(tl.push(replay(108, 0.8, { stage: 17 })).action, "added");
	// revisiting the first replay merges back into its event, skipping the
	// incompatible ones in between
	assert.equal(tl.push(replay(112, 0.7, { stage: 21 })).action, "merged");
	assert.equal(tl.events.length, 3);
});

test("a null stage read never splits", () => {
	const tl = new TimelineBuilder({ minConfidence: 0 });
	tl.push(replay(100, 0.8, { stage: 21 }));
	assert.equal(tl.push(replay(104, 0.7, { stage: null })).action, "merged");
});

test("different recording timestamps split, equal ones merge", () => {
	const tl = new TimelineBuilder({ minConfidence: 0 });
	tl.push(replay(100, 0.8, { timestamp: "3/7/2026 21:15" }));
	assert.equal(
		tl.push(replay(104, 0.8, { timestamp: "3/7/2026 21:22" })).action,
		"added",
	);
	assert.equal(
		tl.push(replay(108, 0.7, { timestamp: "3/7/2026 21:15" })).action,
		"merged",
	);
});

test("replay codes tolerate misread glyphs but split on real differences", () => {
	const tl = new TimelineBuilder({ minConfidence: 0 });
	tl.push(replay(100, 0.8, { replayCode: "R797-V51Y-945W-C4JJ" }));
	// same replay, three glyphs misread on a low-fidelity capture
	assert.equal(
		tl.push(replay(104, 0.7, { replayCode: "R797-U51Y-945W-G4JL" })).action,
		"merged",
	);
	assert.equal(
		tl.push(replay(108, 0.8, { replayCode: "RVRM-XXEL-0573-Q4SV" })).action,
		"added",
	);
});

test("disjoint paint totals split when stage and code are unreadable", () => {
	const tl = new TimelineBuilder({ minConfidence: 0 });
	tl.push(
		replay(100, 0.8, {
			players: players([327, 408, 270, 354, 381, 613, 456, 287]),
		}),
	);
	const other = replay(104, 0.8, {
		players: players([733, 946, 1020, 878, 666, 1068, 1050, 631]),
	});
	assert.equal(tl.push(other).action, "added");
	// same board re-read with jitter: a couple of rows misread or null
	const jittered = replay(108, 0.7, {
		players: players([733, 946, 1020, null, 666, 1068, 1050, 613]),
	});
	assert.equal(tl.push(jittered).action, "merged");
	assert.equal(tl.events.length, 2);
});

test("too few readable paints never split", () => {
	const tl = new TimelineBuilder({ minConfidence: 0 });
	tl.push(
		replay(100, 0.8, {
			players: players([327, 408, 270, null, null, null, null, null]),
		}),
	);
	const other = replay(104, 0.7, {
		players: players([733, 946, 1020, null, null, null, null, null]),
	});
	assert.equal(tl.push(other).action, "merged");
});

test("per-type merge window: repeat death frames merge, consecutive deaths do not", () => {
	const tl = new TimelineBuilder({ minConfidence: 0 });
	assert.equal(tl.push(event(100, 0.8, "Death")).action, "added");
	// same death, sampled again 3s later
	assert.equal(tl.push(event(103, 0.7, "Death")).action, "merged");
	// next death after respawn + travel: outside the 8s Death window but
	// well inside the default 30s
	assert.equal(tl.push(event(112, 0.8, "Death")).action, "added");
	assert.equal(tl.events.length, 2);
	// scoreboards keep the wide default window
	tl.push(event(200, 0.8, "Scoreboard"));
	assert.equal(tl.push(event(212, 0.7, "Scoreboard")).action, "merged");
});
