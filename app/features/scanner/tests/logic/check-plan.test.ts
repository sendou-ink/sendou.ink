/**
 * createCheckTracker against a DetectorScheduler driven the way the VoD
 * analyzer drives it: every sample a pass runs on must have been let through,
 * whatever the gates and parses report and however far the tracker runs
 * ahead of the plans it is handed.
 */

import assert from "node:assert/strict";
import { seededRandom } from "~/utils/random";
import { createCheckTracker } from "../../core/detectors/check-plan";
import {
	DetectorScheduler,
	type SchedulingInfo,
} from "../../core/detectors/scheduler";
import { test } from "../node-test-compat";

const DETECTORS: SchedulingInfo[] = [
	{ id: "default" },
	{ id: "fixed", checkIntervalS: 0.5 },
	{ id: "slow-refine", refineIntervalS: 0.4, rearmCooldownS: 5 },
	{
		id: "sufficient",
		refineIntervalS: 0.5,
		rearmCooldownS: 4,
		sufficientConfidence: 0.9,
	},
	{ id: "fast-search", searchIntervalS: 0.1, maxStagnantParses: 2 },
];

test("every analyzed sample is let through at 60 fps", () => {
	const { missed } = simulate({ fps: 60, seed: 1, lag: 20 });
	assert.deepEqual(missed, []);
});

test("every analyzed sample is let through at 30 fps", () => {
	const { missed } = simulate({ fps: 30, seed: 2, lag: 8 });
	assert.deepEqual(missed, []);
});

test("every analyzed sample is let through with jittery timestamps", () => {
	const { missed } = simulate({ fps: 60, seed: 3, lag: 30, jitter: true });
	assert.deepEqual(missed, []);
});

test("every analyzed sample is let through with the plan applied at once", () => {
	const { missed } = simulate({ fps: 60, seed: 4, lag: 0 });
	assert.deepEqual(missed, []);
});

test("most samples between checks are left out", () => {
	const { wantedShare } = simulate({ fps: 60, seed: 5, lag: 3 });
	assert.ok(wantedShare < 0.5, `wanted share ${wantedShare}`);
});

test("without a plan every sample is let through", () => {
	const tracker = createCheckTracker();
	assert.equal(tracker.step(0), true);
	tracker.setPlan({
		t: 0,
		detectors: [{ lastCheckT: 0, next: [1], later: [1] }],
	});
	assert.equal(tracker.step(0.5), false);
	tracker.setPlan(null);
	assert.equal(tracker.wanted(0.5), true);
	assert.equal(tracker.step(0.6), true);
});

test("a plan made at a sample the tracker never stepped lets everything through", () => {
	const tracker = createCheckTracker();
	tracker.step(0);
	tracker.setPlan({
		t: 0.25,
		detectors: [{ lastCheckT: 0.25, next: [1], later: [1] }],
	});
	assert.equal(tracker.step(0.5), true);
});

/**
 * Steps a tracker `lag` samples ahead of a scheduler fed random gate and
 * parse outcomes, handing it a plan at each pass's start, after its gates and
 * after its parses, as the analyzer does.
 */
function simulate({
	fps,
	seed,
	lag,
	jitter = false,
}: {
	fps: number;
	seed: number;
	lag: number;
	jitter?: boolean;
}) {
	const { random } = seededRandom(String(seed));
	const times: number[] = [];
	let t = 0;
	for (let i = 0; i < fps * 600; i++) {
		times.push(Math.round(t * 1000) / 1000);
		t += (1 / fps) * (jitter ? 0.5 + random() : 1);
	}
	const scheduler = new DetectorScheduler(DETECTORS, {
		matchOpeningTypes: ["MapStart"],
		matchClosingTypes: ["Scoreboard"],
	});
	const tracker = createCheckTracker();
	const stepped = new Map<number, boolean>();
	let ahead = 0;
	const stepTo = (index: number) => {
		while (ahead <= Math.min(index, times.length - 1)) {
			const sample = times[ahead]!;
			stepped.set(sample, tracker.step(sample));
			ahead++;
		}
	};
	const passing = new Map<string, boolean>();
	const missed: string[] = [];
	let wanted = 0;
	for (const [index, sample] of times.entries()) {
		stepTo(index + lag);
		const due =
			sample >= scheduler.nextDueT() ? scheduler.dueDetectors(sample) : [];
		if (due.length === 0) continue;
		if (!stepped.get(sample) || !tracker.wanted(sample)) {
			missed.push(`${sample}: ${due.join(",")}`);
		}
		tracker.setPlan(scheduler.checkPlan(sample, due));
		const parsing: string[] = [];
		for (const id of due) {
			// gates hold their outcome for stretches, like screens do
			if (random() < 0.1) passing.set(id, !passing.get(id));
			const pass = passing.get(id) ?? false;
			scheduler.recordGate(id, sample, pass, [Math.floor(random() * 3) * 20]);
			if (pass && scheduler.shouldParse(id, sample)) parsing.push(id);
		}
		stepTo(index + lag + Math.floor(random() * 5));
		tracker.setPlan(scheduler.checkPlan(sample, parsing));
		for (const id of parsing) {
			scheduler.recordParse(
				id,
				sample,
				random() < 0.5
					? []
					: [{ type: "Event", confidence: Math.round(random() * 10) / 10 }],
			);
		}
		stepTo(index + lag + Math.floor(random() * 5));
		tracker.setPlan(scheduler.checkPlan(sample, []));
	}
	for (const verdict of stepped.values()) if (verdict) wanted++;
	return { missed, wantedShare: wanted / times.length };
}
