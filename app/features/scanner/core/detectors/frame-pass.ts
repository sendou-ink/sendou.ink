/**
 * One scheduled pass of the detector registry over a frame, shared by the
 * analyzer worker and the CLI scan. Gates run in registry order first, then
 * every approved parse runs — sequentially on the calling thread, or, given a
 * batching driver (worker/gpu-matcher.ts), as one lockstep of every parse's
 * match steps so the frame costs one chain of round trips instead of one per
 * detector. Parse results are recorded with the scheduler in registry order
 * afterwards; scheduler decisions within a frame depend only on each
 * detector's own state, so this ordering is equivalent to gating and parsing
 * one detector at a time.
 */
import type { Mat } from "../cv";
import { all, type MatchScores, type MatchSteps } from "../match-steps";
import type { DetectorScheduler } from "./scheduler";
import { detectorTelemetry, type ScanTelemetry } from "./telemetry";
import type { DetectedEvent, Detector, GateResult } from "./types";

export interface DetectorOutcome {
	detector: Detector<unknown>;
	gate: GateResult;
	/** the gate passed and the scheduler let the parse run */
	parsed: boolean;
	/** empty when the gate failed or the scheduler suppressed the parse */
	events: DetectedEvent<unknown>[];
}

/** Runs match steps to completion, answering requests in batches (a GPU driver's `run`). */
export type StepsRunner = <T>(steps: MatchSteps<T>) => Promise<T>;

/** Gates and parses the `due` detectors over `frame`; outcomes come back in registry order. */
export async function runDetectorPass({
	frame,
	t,
	detectors,
	due,
	scheduler,
	telemetry,
	runSteps,
	speculative = true,
	onGated,
}: {
	frame: Mat;
	t: number;
	detectors: readonly Detector<unknown>[];
	due: readonly string[];
	scheduler: DetectorScheduler;
	telemetry: ScanTelemetry | null;
	/** batching driver; omitted = every parse runs synchronously */
	runSteps?: StepsRunner;
	/** prefetch candidate sets in lockstep (batching drivers only) */
	speculative?: boolean;
	/** called once every gate is recorded, before the parses run, with the parsing detectors' ids */
	onGated?: (parsing: readonly string[]) => void;
}): Promise<DetectorOutcome[]> {
	const gated: DetectorOutcome[] = [];
	for (const detector of detectors) {
		if (!due.includes(detector.id)) continue;
		const counters = telemetry
			? detectorTelemetry(telemetry, detector.id)
			: null;
		const gateStart = counters ? performance.now() : 0;
		const gate = detector.gate(frame);
		if (counters) {
			counters.checks++;
			counters.gateMs += performance.now() - gateStart;
		}
		scheduler.recordGate(detector.id, t, gate.pass, gate.signature);
		if (counters && gate.pass) counters.gatePasses++;
		const parsed = gate.pass && scheduler.shouldParse(detector.id, t);
		if (counters && gate.pass && !parsed) counters.suppressedParses++;
		gated.push({ detector, gate, parsed, events: [] });
	}

	const parsing = gated.filter((outcome) => outcome.parsed);
	onGated?.(parsing.map((outcome) => outcome.detector.id));
	const addParseMs = (detector: Detector<unknown>, ms: number) => {
		if (telemetry) detectorTelemetry(telemetry, detector.id).parseMs += ms;
	};
	if (runSteps && parsing.length > 0) {
		const results = await runSteps(
			all(
				parsing.map(({ detector, gate }) =>
					timed(detector.parseSteps(frame, t, gate, speculative), (ms) =>
						addParseMs(detector, ms),
					),
				),
			),
		);
		for (const [i, outcome] of parsing.entries()) {
			outcome.events = results[i]!;
		}
	} else {
		for (const outcome of parsing) {
			const parseStart = telemetry ? performance.now() : 0;
			outcome.events = outcome.detector.parse(frame, t, outcome.gate);
			if (telemetry)
				addParseMs(outcome.detector, performance.now() - parseStart);
		}
	}

	for (const { detector, events } of parsing) {
		if (telemetry) detectorTelemetry(telemetry, detector.id).parses++;
		scheduler.recordParse(detector.id, t, events);
	}
	return gated;
}

/** `steps` with the time spent inside its own resumptions reported (the parse's CPU share; batched matching is not attributed). */
function* timed<T>(
	steps: MatchSteps<T>,
	report: (ms: number) => void,
): MatchSteps<T> {
	let scores: MatchScores[] | undefined;
	for (;;) {
		const start = performance.now();
		const step = scores === undefined ? steps.next() : steps.next(scores);
		report(performance.now() - start);
		if (step.done) return step.value;
		scores = yield step.value;
	}
}
