/**
 * Unit tests for DetectorScheduler: search/refine check cadence,
 * steady-frame suppression (stagnation and sufficient-confidence early
 * stop), the rearm cooldown, checkIntervalS compatibility, and the calm
 * signal that drives VoD skim mode.
 */

import assert from "node:assert/strict";
import {
	DetectorScheduler,
	type SchedulingInfo,
} from "../../core/detectors/scheduler";
import test from "../node-test-compat";

const OPTS = {
	refineIntervalS: 0.1,
	searchIntervalS: 0.1,
	maxStagnantParses: 3,
	stagnantAfterS: 0.25,
	minImprovement: 0.001,
	quietAfterS: 10,
	matchOpenMaxS: 60,
	matchOpeningTypes: ["MapStart"],
	matchClosingTypes: ["Scoreboard"],
};

function make(detector: Partial<SchedulingInfo>, options = {}) {
	return new DetectorScheduler([{ id: "d", ...detector }], {
		...OPTS,
		...options,
	});
}

function feed(
	s: DetectorScheduler,
	t: number,
	options: {
		pass: boolean;
		confidence?: number;
		type?: string;
		signature?: number[];
	},
): "skipped" | "gated" | "parsed" {
	if (!s.dueDetectors(t).includes("d")) return "skipped";
	s.recordGate("d", t, options.pass, options.signature);
	if (!options.pass || !s.shouldParse("d", t)) return "gated";
	s.recordParse(
		"d",
		t,
		options.confidence === undefined
			? []
			: [{ type: options.type ?? "Event", confidence: options.confidence }],
	);
	return "parsed";
}

test("a failing gate is only re-checked at the search cadence", () => {
	const s = make({ searchIntervalS: 1 });
	assert.equal(feed(s, 0, { pass: false }), "gated");
	assert.equal(feed(s, 0.5, { pass: false }), "skipped");
	assert.equal(feed(s, 0.99, { pass: false }), "skipped");
	assert.equal(feed(s, 1, { pass: false }), "gated");
});

test("a passing gate drops to the dense refine cadence", () => {
	const s = make({ searchIntervalS: 1 });
	assert.equal(feed(s, 0, { pass: true, confidence: 0.7 }), "parsed");
	assert.equal(feed(s, 0.05, { pass: true, confidence: 0.7 }), "skipped");
	assert.equal(feed(s, 0.1, { pass: true, confidence: 0.7 }), "parsed");
	assert.equal(feed(s, 0.2, { pass: true, confidence: 0.7 }), "parsed");
});

test("a per-detector refine interval overrides the dense default", () => {
	const s = make({ refineIntervalS: 0.5 });
	assert.equal(feed(s, 0, { pass: true, confidence: 0.7 }), "parsed");
	assert.equal(feed(s, 0.1, { pass: true, confidence: 0.7 }), "skipped");
	assert.equal(feed(s, 0.4, { pass: true, confidence: 0.7 }), "skipped");
	assert.equal(feed(s, 0.5, { pass: true, confidence: 0.7 }), "parsed");
});

test("a per-detector stagnation budget suppresses sooner", () => {
	const s = make({ maxStagnantParses: 2 }, { stagnantAfterS: 0.1 });
	assert.equal(feed(s, 0.0, { pass: true, confidence: 0.9 }), "parsed");
	assert.equal(feed(s, 0.1, { pass: true, confidence: 0.9 }), "parsed");
	assert.equal(feed(s, 0.2, { pass: true, confidence: 0.9 }), "parsed");
	assert.equal(feed(s, 0.3, { pass: true, confidence: 0.9 }), "gated");
});

test("suppresses after stagnant parses on a static screen", () => {
	const s = make({});
	assert.equal(feed(s, 0.0, { pass: true, confidence: 0.9 }), "parsed");
	assert.equal(feed(s, 0.1, { pass: true, confidence: 0.9 }), "parsed");
	assert.equal(feed(s, 0.2, { pass: true, confidence: 0.9 }), "parsed");
	assert.equal(feed(s, 0.3, { pass: true, confidence: 0.9 }), "parsed");
	assert.equal(feed(s, 0.4, { pass: true, confidence: 0.9 }), "gated");
	assert.equal(feed(s, 0.5, { pass: true, confidence: 0.9 }), "gated");
});

test("an improving read resets the stagnation counter", () => {
	const s = make({});
	feed(s, 0.0, { pass: true, confidence: 0.7 });
	feed(s, 0.1, { pass: true, confidence: 0.7 });
	feed(s, 0.2, { pass: true, confidence: 0.7 });
	assert.equal(feed(s, 0.3, { pass: true, confidence: 0.85 }), "parsed");
	assert.equal(feed(s, 0.4, { pass: true, confidence: 0.85 }), "parsed");
	assert.equal(feed(s, 0.5, { pass: true, confidence: 0.85 }), "parsed");
	assert.equal(feed(s, 0.6, { pass: true, confidence: 0.85 }), "parsed");
	assert.equal(feed(s, 0.7, { pass: true, confidence: 0.85 }), "gated");
});

test("a gate drop ends the streak and re-enables parsing", () => {
	const s = make({});
	for (let i = 0; i < 5; i++) feed(s, i * 0.1, { pass: true, confidence: 0.9 });
	assert.equal(feed(s, 0.5, { pass: true, confidence: 0.9 }), "gated");
	assert.equal(feed(s, 0.6, { pass: false }), "gated");
	assert.equal(feed(s, 0.7, { pass: true, confidence: 0.9 }), "parsed");
});

test("gate firing without events stagnates too", () => {
	const s = make({});
	for (let i = 0; i < 4; i++) {
		assert.equal(feed(s, i * 0.1, { pass: true }), "parsed");
	}
	assert.equal(feed(s, 0.4, { pass: true }), "gated");
});

test("dense no-read parses during an entry animation respect the time floor", () => {
	const s = make({}, { stagnantAfterS: 3 });
	// the gate fires from t=0 while the screen is still animating in and
	// parses read nothing — a parse count alone must not suppress here
	for (let i = 0; i < 8; i++) {
		assert.equal(feed(s, i * 0.15, { pass: true }), "parsed");
	}
	// the screen becomes readable and the read still lands
	assert.equal(feed(s, 1.35, { pass: true, confidence: 0.88 }), "parsed");
	// once truly static past the time floor, suppression still kicks in
	for (let i = 0; i < 25; i++) {
		feed(s, 1.5 + i * 0.15, { pass: true, confidence: 0.88 });
	}
	assert.equal(feed(s, 5.4, { pass: true, confidence: 0.88 }), "gated");
});

test("a sufficient read suppresses immediately", () => {
	const s = make({ sufficientConfidence: 0.95 });
	assert.equal(feed(s, 0.0, { pass: true, confidence: 0.96 }), "parsed");
	assert.equal(feed(s, 0.1, { pass: true, confidence: 0.99 }), "gated");
	// gate drop = screen changed = fresh streak parses again
	feed(s, 0.2, { pass: false });
	assert.equal(feed(s, 0.3, { pass: true, confidence: 0.7 }), "parsed");
});

test("a changed gate signature re-arms a suppressed streak", () => {
	const s = make({ sufficientConfidence: 0.8 });
	const entryA = [20, 200];
	const entryB = [200, 20];
	assert.equal(
		feed(s, 0, { pass: true, confidence: 0.9, signature: entryA }),
		"parsed",
	);
	assert.equal(
		feed(s, 0.1, { pass: true, confidence: 0.9, signature: entryA }),
		"gated",
	);
	// codec noise within tolerance is still the same screen
	assert.equal(
		feed(s, 0.2, { pass: true, confidence: 0.9, signature: [22, 198] }),
		"gated",
	);
	// the next browsed entry keeps the gate passing but moves the content
	assert.equal(
		feed(s, 0.3, { pass: true, confidence: 0.9, signature: entryB }),
		"parsed",
	);
	assert.equal(
		feed(s, 0.4, { pass: true, confidence: 0.9, signature: entryB }),
		"gated",
	);
});

test("a signature change mid-streak starts a fresh best", () => {
	const s = make({});
	feed(s, 0.0, { pass: true, confidence: 0.9, signature: [0] });
	feed(s, 0.1, { pass: true, confidence: 0.9, signature: [0] });
	// the next entry reads worse than the old best — with the old streak's
	// best carried over these would count stagnant and suppress at t=0.4
	feed(s, 0.2, { pass: true, confidence: 0.7, signature: [255] });
	feed(s, 0.3, { pass: true, confidence: 0.7, signature: [255] });
	assert.equal(
		feed(s, 0.4, { pass: true, confidence: 0.7, signature: [255] }),
		"parsed",
	);
});

test("rearm cooldown skips parses across gate flicker", () => {
	const s = make({ sufficientConfidence: 0.95, rearmCooldownS: 4 });
	assert.equal(feed(s, 1.0, { pass: true, confidence: 0.96 }), "parsed");
	feed(s, 1.5, { pass: false });
	assert.equal(feed(s, 2.0, { pass: true, confidence: 0.9 }), "gated");
	assert.equal(feed(s, 4.9, { pass: true, confidence: 0.9 }), "gated");
	assert.equal(feed(s, 5.1, { pass: true, confidence: 0.9 }), "parsed");
});

test("checkIntervalS caps both phases and exempts from suppression", () => {
	const s = make({ checkIntervalS: 1 });
	assert.equal(feed(s, 0.0, { pass: true, confidence: 0.9 }), "parsed");
	assert.equal(feed(s, 0.5, { pass: true, confidence: 0.9 }), "skipped");
	for (let t = 1; t < 10; t++) {
		assert.equal(feed(s, t, { pass: true, confidence: 0.9 }), "parsed");
	}
});

test("suppressSteadyFrames=false checks and parses every frame", () => {
	const s = make(
		{ searchIntervalS: 1, sufficientConfidence: 0.5 },
		{ suppressSteadyFrames: false },
	);
	for (let i = 0; i < 10; i++) {
		assert.equal(feed(s, 0, { pass: true, confidence: 0.9 }), "parsed");
	}
	assert.equal(s.calm(1000), false);
});

test("calm needs a quiet period and no open match", () => {
	const s = make({});
	assert.equal(feed(s, 0, { pass: false }), "gated");
	assert.equal(s.calm(5), false);
	assert.equal(s.calm(10), true);
	// a gate pass resets the quiet clock
	feed(s, 10, { pass: true, confidence: 0.9 });
	assert.equal(s.calm(15), false);
	assert.equal(s.calm(20), true);
	// a confident map-start keeps the scan active for matchOpenMaxS
	feed(s, 21, { pass: true, confidence: 0.9, type: "MapStart" });
	assert.equal(s.calm(50), false);
	assert.equal(s.calm(21 + 60), true);
});

test("a scoreboard closes the match early", () => {
	const s = make({});
	feed(s, 0, { pass: true, confidence: 0.9, type: "MapStart" });
	assert.equal(s.calm(30), false);
	feed(s, 31, { pass: true, confidence: 0.9, type: "Scoreboard" });
	// quiet period still applies after the closing read
	assert.equal(s.calm(35), false);
	assert.equal(s.calm(41), true);
});

test("a t jumping backwards resets the session", () => {
	const s = make({ searchIntervalS: 1 });
	feed(s, 100, { pass: false });
	assert.equal(feed(s, 100.5, { pass: false }), "skipped");
	// a rescan starts earlier than anything seen — fresh state, due again
	assert.equal(feed(s, 0, { pass: false }), "gated");
});

test("detectors are tracked independently", () => {
	const s = new DetectorScheduler(
		[{ id: "a" }, { id: "b", searchIntervalS: 1 }],
		OPTS,
	);
	assert.deepEqual(s.dueDetectors(0), ["a", "b"]);
	s.recordGate("a", 0, true);
	s.recordGate("b", 0, false);
	assert.deepEqual(s.dueDetectors(0.5), ["a"]);
	assert.deepEqual(s.dueDetectors(1), ["a", "b"]);
});

test("nextDueT lets frames skip analysis entirely", () => {
	const s = new DetectorScheduler(
		[
			{ id: "a", searchIntervalS: 0.5 },
			{ id: "b", searchIntervalS: 1 },
		],
		OPTS,
	);
	assert.equal(s.nextDueT(), Number.NEGATIVE_INFINITY);
	s.dueDetectors(0);
	s.recordGate("a", 0, false);
	s.recordGate("b", 0, false);
	assert.equal(s.nextDueT(), 0.5);
});
