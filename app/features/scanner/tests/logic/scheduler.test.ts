/**
 * DetectorScheduler tests: search/refine cadence, steady-frame suppression,
 * the rearm cooldown, checkIntervalS compatibility, and the calm signal.
 */

import assert from "node:assert/strict";
import {
	DetectorScheduler,
	type ParsedRead,
	type SchedulingInfo,
} from "../../core/detectors/scheduler";
import { test } from "../node-test-compat";

const OPTS = {
	refineIntervalS: 0.1,
	searchIntervalS: 0.1,
	maxStagnantParses: 3,
	stagnantAfterS: 0.25,
	quietAfterS: 10,
	matchOpenMaxS: 60,
};

function make(detector: Partial<SchedulingInfo>, options = {}) {
	return new DetectorScheduler([{ id: "d", ...detector }], {
		...OPTS,
		...options,
	});
}

/**
 * What the timeline made of a parse's read: "new" changed what it holds,
 * "same" merged into a kept read, "complete" merged into a complete one,
 * "dropped" fell under the kind's floor.
 */
type Read = "new" | "same" | "complete" | "dropped";

function parsedRead(read: Read, type = "Event"): ParsedRead {
	return {
		type,
		kept: read !== "dropped",
		changed: read === "new",
		complete: read === "complete",
	};
}

function feed(
	s: DetectorScheduler,
	t: number,
	options: {
		pass: boolean;
		/** omitted = the parse read nothing */
		read?: Read;
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
		options.read === undefined ? [] : [parsedRead(options.read, options.type)],
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
	assert.equal(feed(s, 0, { pass: true, read: "same" }), "parsed");
	assert.equal(feed(s, 0.05, { pass: true, read: "same" }), "skipped");
	assert.equal(feed(s, 0.1, { pass: true, read: "same" }), "parsed");
	assert.equal(feed(s, 0.2, { pass: true, read: "same" }), "parsed");
});

test("a per-detector refine interval overrides the dense default", () => {
	const s = make({ refineIntervalS: 0.5 });
	assert.equal(feed(s, 0, { pass: true, read: "same" }), "parsed");
	assert.equal(feed(s, 0.1, { pass: true, read: "same" }), "skipped");
	assert.equal(feed(s, 0.4, { pass: true, read: "same" }), "skipped");
	assert.equal(feed(s, 0.5, { pass: true, read: "same" }), "parsed");
});

test("a per-detector stagnation budget suppresses sooner", () => {
	const s = make({ maxStagnantParses: 2 }, { stagnantAfterS: 0.1 });
	assert.equal(feed(s, 0.0, { pass: true, read: "same" }), "parsed");
	assert.equal(feed(s, 0.1, { pass: true, read: "same" }), "parsed");
	assert.equal(feed(s, 0.2, { pass: true, read: "same" }), "parsed");
	assert.equal(feed(s, 0.3, { pass: true, read: "same" }), "gated");
});

test("suppresses after stagnant parses on a static screen", () => {
	const s = make({});
	assert.equal(feed(s, 0.0, { pass: true, read: "same" }), "parsed");
	assert.equal(feed(s, 0.1, { pass: true, read: "same" }), "parsed");
	assert.equal(feed(s, 0.2, { pass: true, read: "same" }), "parsed");
	assert.equal(feed(s, 0.3, { pass: true, read: "same" }), "parsed");
	assert.equal(feed(s, 0.4, { pass: true, read: "same" }), "gated");
	assert.equal(feed(s, 0.5, { pass: true, read: "same" }), "gated");
});

test("a read that changes the timeline resets the stagnation counter", () => {
	const s = make({});
	feed(s, 0.0, { pass: true, read: "new" });
	feed(s, 0.1, { pass: true, read: "same" });
	feed(s, 0.2, { pass: true, read: "same" });
	assert.equal(feed(s, 0.3, { pass: true, read: "new" }), "parsed");
	assert.equal(feed(s, 0.4, { pass: true, read: "same" }), "parsed");
	assert.equal(feed(s, 0.5, { pass: true, read: "same" }), "parsed");
	assert.equal(feed(s, 0.6, { pass: true, read: "same" }), "parsed");
	assert.equal(feed(s, 0.7, { pass: true, read: "same" }), "gated");
});

test("reads the timeline drops stagnate like a parse that read nothing", () => {
	const s = make({});
	for (let i = 0; i < 4; i++) {
		assert.equal(feed(s, i * 0.1, { pass: true, read: "dropped" }), "parsed");
	}
	assert.equal(feed(s, 0.4, { pass: true, read: "dropped" }), "gated");
});

test("a per-detector stagnation time overrides the shared one", () => {
	const s = make({ stagnantAfterS: 0.5 });
	for (let i = 0; i < 5; i++) {
		assert.equal(feed(s, i * 0.1, { pass: true, read: "same" }), "parsed");
	}
	assert.equal(feed(s, 0.5, { pass: true, read: "same" }), "parsed");
	assert.equal(feed(s, 0.6, { pass: true, read: "same" }), "gated");
});

test("a gate drop ends the streak and re-enables parsing", () => {
	const s = make({});
	for (let i = 0; i < 5; i++) feed(s, i * 0.1, { pass: true, read: "same" });
	assert.equal(feed(s, 0.5, { pass: true, read: "same" }), "gated");
	assert.equal(feed(s, 0.6, { pass: false }), "gated");
	assert.equal(feed(s, 0.7, { pass: true, read: "same" }), "parsed");
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
	assert.equal(feed(s, 1.35, { pass: true, read: "new" }), "parsed");
	// once truly static past the time floor, suppression still kicks in
	for (let i = 0; i < 25; i++) {
		feed(s, 1.5 + i * 0.15, { pass: true, read: "same" });
	}
	assert.equal(feed(s, 5.4, { pass: true, read: "same" }), "gated");
});

test("a complete read suppresses immediately", () => {
	const s = make({});
	assert.equal(feed(s, 0.0, { pass: true, read: "complete" }), "parsed");
	assert.equal(feed(s, 0.1, { pass: true, read: "complete" }), "gated");
	// gate drop = screen changed = fresh streak parses again
	feed(s, 0.2, { pass: false });
	assert.equal(feed(s, 0.3, { pass: true, read: "new" }), "parsed");
});

test("a read completing the kept one after earlier parses suppresses too", () => {
	const s = make({});
	assert.equal(feed(s, 0.0, { pass: true, read: "new" }), "parsed");
	assert.equal(feed(s, 0.1, { pass: true, read: "same" }), "parsed");
	assert.equal(feed(s, 0.2, { pass: true, read: "complete" }), "parsed");
	assert.equal(feed(s, 0.3, { pass: true, read: "complete" }), "gated");
});

test("a changed gate signature re-arms a suppressed streak", () => {
	const s = make({});
	const entryA = [20, 200];
	const entryB = [200, 20];
	assert.equal(
		feed(s, 0, { pass: true, read: "complete", signature: entryA }),
		"parsed",
	);
	assert.equal(
		feed(s, 0.1, { pass: true, read: "complete", signature: entryA }),
		"gated",
	);
	// codec noise within tolerance is still the same screen
	assert.equal(
		feed(s, 0.2, { pass: true, read: "complete", signature: [22, 198] }),
		"gated",
	);
	// the next browsed entry keeps the gate passing but moves the content
	assert.equal(
		feed(s, 0.3, { pass: true, read: "complete", signature: entryB }),
		"parsed",
	);
	assert.equal(
		feed(s, 0.4, { pass: true, read: "complete", signature: entryB }),
		"gated",
	);
});

test("a signature change mid-streak starts a fresh streak", () => {
	const s = make({});
	feed(s, 0.0, { pass: true, read: "new", signature: [0] });
	feed(s, 0.1, { pass: true, read: "same", signature: [0] });
	// the next entry merges into a read the timeline already holds — with the
	// old streak carried over these would count stagnant and suppress at t=0.4
	feed(s, 0.2, { pass: true, read: "same", signature: [255] });
	feed(s, 0.3, { pass: true, read: "same", signature: [255] });
	assert.equal(
		feed(s, 0.4, { pass: true, read: "same", signature: [255] }),
		"parsed",
	);
});

test("rearm cooldown skips parses across gate flicker", () => {
	const s = make({ rearmCooldownS: 4 });
	assert.equal(feed(s, 1.0, { pass: true, read: "complete" }), "parsed");
	feed(s, 1.5, { pass: false });
	assert.equal(feed(s, 2.0, { pass: true, read: "same" }), "gated");
	assert.equal(feed(s, 4.9, { pass: true, read: "same" }), "gated");
	assert.equal(feed(s, 5.1, { pass: true, read: "same" }), "parsed");
});

test("checkIntervalS caps both phases and exempts from suppression", () => {
	const s = make({ checkIntervalS: 1 });
	assert.equal(feed(s, 0.0, { pass: true, read: "same" }), "parsed");
	assert.equal(feed(s, 0.5, { pass: true, read: "same" }), "skipped");
	for (let t = 1; t < 10; t++) {
		assert.equal(feed(s, t, { pass: true, read: "same" }), "parsed");
	}
});

test("suppressSteadyFrames=false checks and parses every frame", () => {
	const s = make({ searchIntervalS: 1 }, { suppressSteadyFrames: false });
	for (let i = 0; i < 10; i++) {
		assert.equal(feed(s, 0, { pass: true, read: "complete" }), "parsed");
	}
	assert.equal(s.calm(1000), false);
});

test("calm needs a quiet period and no open match", () => {
	const s = make({});
	assert.equal(feed(s, 0, { pass: false }), "gated");
	assert.equal(s.calm(5), false);
	assert.equal(s.calm(10), true);
	// a gate pass resets the quiet clock
	feed(s, 10, { pass: true, read: "same" });
	assert.equal(s.calm(15), false);
	assert.equal(s.calm(20), true);
	// a map-start the timeline kept keeps the scan active for matchOpenMaxS
	feed(s, 21, { pass: true, read: "new", type: "MapStart" });
	assert.equal(s.calm(50), false);
	assert.equal(s.calm(21 + 60), true);
});

test("a read the timeline dropped neither opens nor closes a match", () => {
	const s = make({});
	feed(s, 0, { pass: true, read: "dropped", type: "MapStart" });
	assert.equal(s.calm(10), true);
	feed(s, 20, { pass: true, read: "new", type: "MapStart" });
	feed(s, 30, { pass: true, read: "dropped", type: "Scoreboard" });
	assert.equal(s.calm(45), false);
});

test("a scoreboard closes the match early", () => {
	const s = make({});
	feed(s, 0, { pass: true, read: "new", type: "MapStart" });
	assert.equal(s.calm(30), false);
	feed(s, 31, { pass: true, read: "new", type: "Scoreboard" });
	// quiet period still applies after the closing read
	assert.equal(s.calm(35), false);
	assert.equal(s.calm(41), true);
});

test("a chunk starting mid-stream counts as an open match until a scoreboard", () => {
	const s = make({});
	s.reset(100, { midStream: true });
	feed(s, 100, { pass: false });
	assert.equal(s.calm(130), false);
	feed(s, 131, { pass: true, read: "new", type: "Scoreboard" });
	assert.equal(s.calm(141), true);
});

test("a chunk starting mid-stream turns calm once matchOpenMaxS passes", () => {
	const s = make({});
	s.reset(100, { midStream: true });
	feed(s, 100, { pass: false });
	assert.equal(s.calm(100 + 60), true);
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

test("nextDueLowerBound never exceeds nextDueT, whatever pending gates and parses report", () => {
	for (const refineIntervalS of [0.5, 2]) {
		for (const read of ["dropped", "new", "complete"] as const) {
			const s = new DetectorScheduler(
				[
					{ id: "a", searchIntervalS: 1, refineIntervalS },
					{ id: "b", searchIntervalS: 3 },
				],
				OPTS,
			);
			s.dueDetectors(0);
			const beforeGates = s.nextDueLowerBound(0, ["a", "b"]);
			s.recordGate("a", 0, true);
			s.recordGate("b", 0, false);
			const bound = s.nextDueLowerBound(0, ["a"]);
			s.recordParse("a", 0, [parsedRead(read)]);
			assert.ok(
				beforeGates <= bound,
				`gates tightened ${beforeGates} to ${bound}`,
			);
			assert.ok(
				bound <= s.nextDueT(),
				`bound ${bound} > next ${s.nextDueT()} (refine ${refineIntervalS}, a ${read} read)`,
			);
		}
	}
});

test("nextDueLowerBound is exact for detectors without a pending parse", () => {
	const s = new DetectorScheduler(
		[
			{ id: "a", searchIntervalS: 0.5 },
			{ id: "b", searchIntervalS: 1 },
		],
		OPTS,
	);
	assert.equal(s.nextDueLowerBound(0, []), Number.NEGATIVE_INFINITY);
	s.dueDetectors(0);
	s.recordGate("a", 0, false);
	s.recordGate("b", 0, false);
	assert.equal(s.nextDueLowerBound(0, []), s.nextDueT());
});

test("nextDueCandidates holds every value nextDueT can take, whatever the pending checks report", () => {
	for (const pass of [false, true]) {
		for (const read of ["dropped", "new", "complete"] as const) {
			const s = new DetectorScheduler(
				[
					{ id: "a", searchIntervalS: 1, refineIntervalS: 0.25 },
					{ id: "b", searchIntervalS: 0.5, refineIntervalS: 0.2 },
					{ id: "c", searchIntervalS: 0.75 },
				],
				OPTS,
			);
			s.dueDetectors(0);
			for (const id of ["a", "b", "c"]) s.recordGate(id, 0, false);
			s.dueDetectors(0.5);
			const candidates = s.nextDueCandidates(0.5, ["b"]);
			s.recordGate("b", 0.5, pass);
			if (pass) s.recordParse("b", 0.5, [parsedRead(read)]);
			assert.ok(
				candidates.includes(s.nextDueT()),
				`${s.nextDueT()} not in ${candidates} (pass ${pass}, a ${read} read)`,
			);
			assert.equal(candidates[0], s.nextDueLowerBound(0.5, ["b"]));
		}
	}
});

test("predictDueTimes follows each detector's current cadence", () => {
	const s = new DetectorScheduler(
		[
			{ id: "a", searchIntervalS: 0.25 },
			{ id: "b", searchIntervalS: 0.5 },
		],
		OPTS,
	);
	s.dueDetectors(0);
	s.recordGate("a", 0, false);
	s.recordGate("b", 0, false);
	assert.deepEqual(s.predictDueTimes(0, ["a", "b"], 3), [0.25, 0.5, 0.75]);
});
