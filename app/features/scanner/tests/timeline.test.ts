import assert from "node:assert/strict";
import type {
	PlayerStatusData,
	SlotEvidence,
} from "../core/detectors/objective/player-status";
import type { ScoreboardData } from "../core/detectors/scoreboard/index";
import type { DetectedEvent, EventType } from "../core/events";
import { TimelineBuilder } from "../core/timeline/index";
import { test } from "./node-test-compat";
import { stubEvent } from "./stub-event";

/** An event scored as a whole (under `read`, no field of its data), so repeats merge without a vote. */
function event(
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

/** A ScoreboardBattleLogReplay event with just the identity-relevant data fields. */
function replay(
	t: number,
	score: number,
	data: Partial<ScoreboardData> & {
		timestamp?: string | null;
		replayCode?: string | null;
	},
): DetectedEvent {
	return stubEvent({
		type: "ScoreboardBattleLogReplay",
		t,
		scores: { read: score },
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
	});
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

test("timeline drops events whose scores average under the floor", () => {
	const tl = new TimelineBuilder({ minMeanScore: 0.6 });
	assert.equal(tl.push(event(0, 0.5)).action, "dropped");
	assert.equal(tl.events.length, 0);
});

test("history screens keep a stricter score floor than the shared one", () => {
	const tl = new TimelineBuilder({ minMeanScore: 0.6 });
	assert.equal(tl.push(replay(100, 0.7, {})).action, "dropped");
	assert.equal(
		tl.push(event(100, 0.7, "QuickScoreboardBattleLog")).action,
		"dropped",
	);
	assert.equal(tl.push(event(100, 0.7)).action, "added");
});

test("timeline merges same-type events inside the window", () => {
	const tl = new TimelineBuilder({ mergeWindow: 30, minMeanScore: 0 });
	assert.equal(tl.push(event(100, 0.8)).action, "added");
	assert.equal(tl.push(event(110, 0.7)).action, "merged");
	assert.equal(tl.events.length, 1);
	assert.deepEqual(tl.events[0]!.scores, { read: 0.8 });
});

test("a read scoring no field is dropped", () => {
	const tl = new TimelineBuilder();
	const unread = stubEvent({
		type: "XSetCount",
		t: 100,
		scores: {},
		data: { mode: "TC", wins: 1, losses: 2 },
	});
	assert.equal(tl.push(unread).action, "dropped");
});

test("timeline replaces the kept read with one that reads more of the screen", () => {
	const tl = new TimelineBuilder();
	tl.push({
		type: "MapStart",
		t: 100,
		scores: { mode: 0.8 },
		data: { mode: "SZ", stage: null },
	});
	const result = tl.push({
		type: "MapStart",
		t: 105,
		scores: { mode: 0.8, stage: 0.9 },
		data: { mode: "SZ", stage: 3 },
	});
	assert.equal(result.action, "replaced");
	assert.equal(tl.events[0]!.t, 105);
});

test("timeline keeps separate events outside the window", () => {
	const tl = new TimelineBuilder({ mergeWindow: 30, minMeanScore: 0 });
	tl.push(event(100, 0.8));
	assert.equal(tl.push(event(200, 0.8)).action, "added");
	assert.equal(tl.events.length, 2);
});

test("different event types never merge", () => {
	const tl = new TimelineBuilder({ mergeWindow: 30, minMeanScore: 0 });
	tl.push(event(100, 0.8, "Scoreboard"));
	assert.equal(tl.push(event(105, 0.8, "Death")).action, "added");
	assert.equal(tl.events.length, 2);
});

test("scoreboards with different stages stay separate inside the window", () => {
	const tl = new TimelineBuilder({ minMeanScore: 0 });
	assert.equal(tl.push(replay(100, 0.9, { stage: 21 })).action, "added");
	assert.equal(tl.push(replay(104, 0.9, { stage: 2 })).action, "added");
	assert.equal(tl.push(replay(108, 0.9, { stage: 17 })).action, "added");
	// revisiting the first replay merges back into its event, skipping the
	// incompatible ones in between
	assert.equal(tl.push(replay(112, 0.8, { stage: 21 })).action, "merged");
	assert.equal(tl.events.length, 3);
});

test("a null stage read never splits", () => {
	const tl = new TimelineBuilder({ minMeanScore: 0 });
	tl.push(replay(100, 0.9, { stage: 21 }));
	assert.equal(tl.push(replay(104, 0.8, { stage: null })).action, "merged");
});

test("different recording timestamps split, equal ones merge", () => {
	const tl = new TimelineBuilder({ minMeanScore: 0 });
	tl.push(replay(100, 0.9, { timestamp: "3/7/2026 21:15" }));
	assert.equal(
		tl.push(replay(104, 0.9, { timestamp: "3/7/2026 21:22" })).action,
		"added",
	);
	assert.equal(
		tl.push(replay(108, 0.8, { timestamp: "3/7/2026 21:15" })).action,
		"merged",
	);
});

test("replay codes tolerate misread glyphs but split on real differences", () => {
	const tl = new TimelineBuilder({ minMeanScore: 0 });
	tl.push(replay(100, 0.9, { replayCode: "R797-V51Y-945W-C4JJ" }));
	// same replay, three glyphs misread on a low-fidelity capture
	assert.equal(
		tl.push(replay(104, 0.8, { replayCode: "R797-U51Y-945W-G4JL" })).action,
		"merged",
	);
	assert.equal(
		tl.push(replay(108, 0.9, { replayCode: "RVRM-XXEL-0573-Q4SV" })).action,
		"added",
	);
});

test("disjoint paint totals split when stage and code are unreadable", () => {
	const tl = new TimelineBuilder({ minMeanScore: 0 });
	tl.push(
		replay(100, 0.9, {
			players: players([327, 408, 270, 354, 381, 613, 456, 287]),
		}),
	);
	const other = replay(104, 0.9, {
		players: players([733, 946, 1020, 878, 666, 1068, 1050, 631]),
	});
	assert.equal(tl.push(other).action, "added");
	// same board re-read with jitter: a couple of rows misread or null
	const jittered = replay(108, 0.8, {
		players: players([733, 946, 1020, null, 666, 1068, 1050, 613]),
	});
	assert.equal(tl.push(jittered).action, "merged");
	assert.equal(tl.events.length, 2);
});

test("a battle log revealing real names stays apart from the alias read of the same board", () => {
	const tl = new TimelineBuilder({ minMeanScore: 0 });
	const board = (names: string[]): ScoreboardData["players"] =>
		[327, 408, 270, 354, 381, 613, 456, 287].map((paint, i) => ({
			name: names[i]!,
			weaponId: null,
			paint,
			ka: i,
			d: 3,
			s: 1,
		}));
	const aliases = ["Mesh Cap", "Slugger", "Sunshield", "Bandana"];
	const realNames = ["Sendou", "Kalle", "Jrod_14", "datkid"];
	tl.push(replay(100, 0.9, { players: board([...aliases, ...aliases]) }));
	const revealed = replay(103, 0.8, {
		players: board([...realNames, ...realNames]),
	});
	assert.equal(tl.push(revealed).action, "added");
	assert.equal(tl.events.length, 2);
});

test("too few readable paints never split", () => {
	const tl = new TimelineBuilder({ minMeanScore: 0 });
	tl.push(
		replay(100, 0.9, {
			players: players([327, 408, 270, null, null, null, null, null]),
		}),
	);
	const other = replay(104, 0.8, {
		players: players([733, 946, 1020, null, null, null, null, null]),
	});
	assert.equal(tl.push(other).action, "merged");
});

test("per-type merge window: repeat death frames merge, consecutive deaths do not", () => {
	const tl = new TimelineBuilder({ minMeanScore: 0 });
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

test("kill stacks merge while unchanged and split when a row enters", () => {
	const tl = new TimelineBuilder();
	const kill = (t: number, names: string[]) =>
		tl.push({
			type: "Kill",
			t,
			scores: { read: 0.8 },
			data: { time: null, names },
		});
	assert.equal(kill(100, ["24K"]).action, "added");
	assert.equal(kill(100.5, ["24K"]).action, "merged");
	assert.equal(kill(101, ["datkid", "24K"]).action, "added");
	assert.equal(kill(104, ["datkid", "24K"]).action, "merged");
	assert.equal(tl.events.length, 2);
});

// Triton cup VoD: "Splatted Jrod_14!" shows from 4:21 but a sharper read at 4:16 took over
test("a kill stack stays at its first read when a repeat reads more confidently", () => {
	const tl = new TimelineBuilder();
	tl.push({
		type: "Kill",
		t: 11077.3,
		scores: { read: 0.92 },
		data: { time: 261, names: ["Jrod_14"] },
	});
	tl.push({
		type: "Kill",
		t: 11082.3,
		scores: { read: 0.937 },
		data: { time: 256, names: ["Jrod_14"] },
	});
	assert.equal(tl.events.length, 1);
	assert.equal(tl.events[0]!.t, 11077.3);
	assert.deepEqual(tl.events[0]!.data, { time: 261, names: ["Jrod_14"] });
});

const ALIVE: SlotEvidence = [0.9, 0.05, 0.05];

/** A PlayerStatus read; `dead` splats slot 0 of the left team. */
function status(t: number, score = 0.8, dead = false): DetectedEvent {
	const data: PlayerStatusData = {
		time: null,
		slots: [
			[dead ? [0.05, 0.05, 0.9] : ALIVE, ALIVE, ALIVE, ALIVE],
			[ALIVE, ALIVE, ALIVE, ALIVE],
		],
		cast: null,
	};
	return { type: "PlayerStatus", t, scores: { read: score }, data };
}

test("status reads are each kept, in time order", () => {
	const tl = new TimelineBuilder();
	for (const t of [100, 101, 103, 102]) {
		assert.equal(tl.push(status(t, 0.8, t === 101)).action, "added");
	}
	assert.deepEqual(
		tl.events.map((e) => e.t),
		[100, 101, 102, 103],
	);
});

test("a higher-scoring repeat never moves a sample", () => {
	const tl = new TimelineBuilder();
	tl.push(status(100, 0.7));
	assert.equal(tl.push(status(101, 0.95)).action, "added");
	assert.equal(tl.events[0]!.t, 100);
});
