import { describe, expect, test } from "vitest";
import type { Mat } from "../../core/cv";
import { runDetectorPass } from "../../core/detectors/frame-pass";
import {
	type ReplayDivergence,
	replayDetectorPass,
} from "../../core/detectors/replay-pass";
import { DetectorScheduler } from "../../core/detectors/scheduler";
import type { Detector } from "../../core/detectors/types";
import type { DetectedEvent } from "../../core/events";
import { done, runSync } from "../../core/match-steps";
import * as ScanLog from "../../core/scan-log";
import { TimelineBuilder } from "../../core/timeline/index";
import { stubEvent } from "../stub-event";

/** What a fake detector sees in a frame. */
interface Picture {
	/** the gate passes */
	lit: boolean;
	confidence: number;
}

const LIT: Picture = { lit: true, confidence: 0.8 };
const DARK: Picture = { lit: false, confidence: 0.8 };

function frameOf(picture: Picture): Mat {
	return picture as unknown as Mat;
}

/**
 * A detector with state across frames, as the real ones have (memos, sticky
 * fits): each read says how many parses its instance has run.
 */
function countingDetector(type: "Kill" | "Death" = "Kill") {
	let gates = 0;
	let parses = 0;
	const parse = (frame: Mat, t: number): DetectedEvent[] => {
		parses++;
		const read = `read ${parses}`;
		return [
			stubEvent({
				type,
				t,
				confidence: (frame as unknown as Picture).confidence,
				data: type === "Kill" ? { time: null, names: [read] } : { name: read },
			}),
		];
	};
	const detector: Detector<DetectedEvent> = {
		id: "counting",
		gate: (frame) => {
			gates++;
			return { pass: (frame as unknown as Picture).lit, score: 1 };
		},
		parse,
		parseSteps: (frame, t) => done(parse(frame, t)),
	};
	return { detector, counts: () => ({ gates, parses }) };
}

function check(
	overrides: Partial<ScanLog.ScanLogCheck> = {},
): ScanLog.ScanLogCheck {
	return {
		detector: "counting",
		pass: true,
		parsed: true,
		reads: [{ type: "Kill", confidence: 0.8 }],
		...overrides,
	};
}

function replay(
	picture: Picture,
	logged: ScanLog.ScanLogCheck[],
	{ detector } = countingDetector(),
	timeline = new TimelineBuilder(),
	t = 10,
) {
	return replayDetectorPass({
		frame: frameOf(picture),
		logged: { t, checks: logged },
		detectors: [detector],
		timeline,
		telemetry: null,
	});
}

const SECONDS = Array.from({ length: 24 }, (_, t) => t);
const LANES = [
	{ tStart: 0, tEnd: 12 },
	{ tStart: 12, tEnd: 24 },
];

/** A scan of a still screen in two lanes, each with a scheduler, a timeline and a detector of its own. */
async function scanInLanes() {
	const log = ScanLog.create(LANES);
	const timelines: (readonly DetectedEvent[])[] = [];
	for (const [laneIndex, { tStart, tEnd }] of LANES.entries()) {
		const { detector } = countingDetector();
		const scheduler = new DetectorScheduler([detector]);
		scheduler.reset(tStart);
		const timeline = new TimelineBuilder();
		for (const t of SECONDS.filter(
			(second) => second >= tStart && second < tEnd,
		)) {
			const outcomes = await runDetectorPass({
				frame: frameOf(LIT),
				t,
				detectors: [detector],
				due: scheduler.dueDetectors(t),
				scheduler,
				timeline,
				telemetry: null,
			});
			for (const { gate, parsed, events } of outcomes) {
				ScanLog.record(log, laneIndex, t, {
					detector: detector.id,
					pass: gate.pass,
					parsed,
					reads: events,
				});
			}
		}
		timelines.push(timeline.events);
	}
	return { log, timelines };
}

describe("replayDetectorPass", () => {
	test("rebuilds every lane's timeline from the scan's log, detector state and suppressed parses included", async () => {
		const scan = await scanInLanes();
		const log = ScanLog.parse(JSON.parse(JSON.stringify(scan.log)));

		const replayed: {
			events: readonly DetectedEvent[];
			divergences: ReplayDivergence[];
			gates: number;
			parses: number;
		}[] = [];
		for (const lane of log.lanes) {
			const { detector, counts } = countingDetector();
			const timeline = new TimelineBuilder();
			const divergences: ReplayDivergence[] = [];
			for (const logged of ScanLog.frames(log, lane)) {
				const pass = await replayDetectorPass({
					frame: frameOf(LIT),
					logged,
					detectors: [detector],
					timeline,
					telemetry: null,
				});
				divergences.push(...pass.divergences);
			}
			replayed.push({ events: timeline.events, divergences, ...counts() });
		}

		expect(replayed.map((lane) => lane.events)).toEqual(scan.timelines);
		expect(replayed.map((lane) => lane.divergences)).toEqual([[], []]);
		// the still screen's parses stagnate: the scheduler suppressed the later ones
		expect(replayed.map((lane) => lane.gates)).toEqual([12, 12]);
		expect(replayed.map((lane) => lane.parses)).toEqual([7, 7]);
	});

	test("parses where the scan's gate passed though the replay's does not, and reports the gate", async () => {
		const { outcomes, divergences } = await replay(DARK, [check()]);

		expect(outcomes[0]!.events).toHaveLength(1);
		expect(divergences).toContainEqual({
			kind: "gate",
			detector: "counting",
			logged: { pass: true, variant: undefined },
			replayed: { pass: false, variant: undefined },
		});
	});

	test("does not parse where the scan's gate failed though the replay's passes", async () => {
		const { outcomes, divergences } = await replay(LIT, [
			check({ pass: false, parsed: false, reads: [] }),
		]);

		expect(outcomes[0]!.parsed).toBe(false);
		expect(divergences.map((divergence) => divergence.kind)).toEqual(["gate"]);
	});

	test("does not parse a frame whose parse the scan's scheduler suppressed", async () => {
		const counting = countingDetector();

		const { divergences } = await replay(
			LIT,
			[check({ parsed: false, reads: [] })],
			counting,
		);

		expect(counting.counts()).toEqual({ gates: 1, parses: 0 });
		expect(divergences).toEqual([]);
	});

	test("leaves a detector the scan did not have due unchecked", async () => {
		const counting = countingDetector();

		await replay(LIT, [], counting);

		expect(counting.counts()).toEqual({ gates: 0, parses: 0 });
	});

	test("gives a read of the logged events their logged confidences and reports its own", async () => {
		const { outcomes, divergences } = await replay(
			{ lit: true, confidence: 0.7 },
			[check({ reads: [{ type: "Kill", confidence: 0.9 }] })],
		);

		expect(outcomes[0]!.events.map((event) => event.confidence)).toEqual([0.9]);
		expect(divergences).toEqual([
			{
				kind: "reads",
				detector: "counting",
				logged: [{ type: "Kill", confidence: 0.9 }],
				replayed: [{ type: "Kill", confidence: 0.7 }],
			},
		]);
	});

	test("keeps the read the scan's timeline kept when the replay's own confidences rank the reads the other way", async () => {
		const counting = countingDetector("Death");
		const timeline = new TimelineBuilder();
		const logged = (confidence: number) => [
			check({ reads: [{ type: "Death", confidence }] }),
		];

		await replay(
			{ lit: true, confidence: 0.82 },
			logged(0.8),
			counting,
			timeline,
			10,
		);
		await replay(
			{ lit: true, confidence: 0.79 },
			logged(0.81),
			counting,
			timeline,
			11,
		);

		expect(timeline.events.map((event) => event.t)).toEqual([11]);
	});

	test("keeps a read's own confidences when it holds other events than the scan's", async () => {
		const { outcomes, divergences } = await replay(
			{ lit: true, confidence: 0.7 },
			[check({ reads: [{ type: "Death", confidence: 0.9 }] })],
		);

		expect(outcomes[0]!.events.map((event) => event.confidence)).toEqual([0.7]);
		expect(divergences.map((divergence) => divergence.kind)).toEqual(["reads"]);
	});

	test("takes the logged confidences on the batched path too", async () => {
		const { detector } = countingDetector();

		const { outcomes } = await replayDetectorPass({
			frame: frameOf({ lit: true, confidence: 0.7 }),
			logged: {
				t: 10,
				checks: [check({ reads: [{ type: "Kill", confidence: 0.9 }] })],
			},
			detectors: [detector],
			timeline: new TimelineBuilder(),
			telemetry: null,
			runSteps: async (steps) => runSync(steps),
		});

		expect(outcomes[0]!.events.map((event) => event.confidence)).toEqual([0.9]);
	});

	test("reports a detector of the scan this build does not have", async () => {
		const { divergences } = await replay(LIT, [
			check({ detector: "retired", pass: false, parsed: false, reads: [] }),
		]);

		expect(divergences).toEqual([{ kind: "detector", detector: "retired" }]);
	});
});
