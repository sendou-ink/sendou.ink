/**
 * One scheduled pass of the detector registry over a frame, shared by the
 * analyzer worker and the CLI scan. Gates run in registry order first, then
 * every approved parse runs — sequentially on the calling thread, or, given a
 * batching driver (worker/gpu-matcher.ts), as one lockstep of every parse's
 * match steps so the frame costs one chain of round trips instead of one per
 * detector. The pass also owns the scan's timeline: every parsed event is
 * pushed here and nowhere else, and the outcome says what the push did. The
 * scheduler is told what the timeline made of each parse (kept, changed,
 * complete) in registry order afterwards; its decisions within a frame depend
 * only on each detector's own state and reads, and a detector's reads only
 * meet reads of their own types in the timeline, so this ordering is
 * equivalent to gating and parsing one detector at a time. A frame holding
 * only the gate ROIs (`wholeFrame` given) is swapped for the whole frame as
 * soon as a gate passes on it: that gate runs again on the whole frame, and
 * so do the gates after it and the parses.
 */
import { type DetectedEvent, isComplete } from "../events";
import type { Image } from "../image";
import { all, type MatchScores, type MatchSteps } from "../match-steps";
import {
	changeOf,
	standingOf,
	type TimelineAction,
	type TimelineBuilder,
} from "../timeline/index";
import type { DetectorScheduler, ParsedRead } from "./scheduler";
import { detectorTelemetry, type ScanTelemetry } from "./telemetry";
import type { Detector, GateResult } from "./types";

export interface DetectorOutcome {
	detector: Detector<DetectedEvent>;
	gate: GateResult;
	/** the gate passed and the scheduler let the parse run */
	parsed: boolean;
	/** empty when the gate failed or the scheduler suppressed the parse */
	events: DetectedEvent[];
	/** what the timeline did with each of `events`, in their order */
	actions: TimelineAction[];
}

/** What the pass asks of the scheduler; a replay answers from the scan's log instead (replay-pass.ts). */
type PassScheduler = Pick<
	DetectorScheduler,
	"recordGate" | "shouldParse" | "recordParse"
>;

/** Runs match steps to completion, answering requests in batches (a GPU driver's `run`). */
export type StepsRunner = <T>(steps: MatchSteps<T>) => Promise<T>;

/** Gates and parses the `due` detectors over `frame`; outcomes come back in registry order. */
export async function runDetectorPass({
	frame,
	t,
	detectors,
	due,
	scheduler,
	timeline,
	telemetry,
	runSteps,
	speculative = true,
	onGated,
	wholeFrame,
}: {
	frame: Image;
	t: number;
	detectors: readonly Detector<DetectedEvent>[];
	due: readonly string[];
	scheduler: PassScheduler;
	timeline: TimelineBuilder;
	telemetry: ScanTelemetry | null;
	/** batching driver; omitted = every parse runs synchronously */
	runSteps?: StepsRunner;
	/** prefetch candidate sets in lockstep (batching drivers only) */
	speculative?: boolean;
	/** called once every gate is recorded, before the parses run, with the parsing detectors' ids */
	onGated?: (parsing: readonly string[]) => void;
	/** `frame` holds only the gate ROIs (core/gate-rois.ts); this fetches the whole frame */
	wholeFrame?: () => Promise<Image>;
}): Promise<DetectorOutcome[]> {
	const gated: DetectorOutcome[] = [];
	let fetchWhole = wholeFrame;
	let current = frame;
	for (const detector of detectors) {
		if (!due.includes(detector.id)) continue;
		const counters = telemetry
			? detectorTelemetry(telemetry, detector.id)
			: null;
		const gateStart = counters ? performance.now() : 0;
		let gate = detector.gate(current);
		if (counters) counters.gateMs += performance.now() - gateStart;
		if (gate.pass && fetchWhole) {
			current = await fetchWhole();
			fetchWhole = undefined;
			const wholeStart = counters ? performance.now() : 0;
			gate = detector.gate(current);
			if (counters) counters.gateMs += performance.now() - wholeStart;
		}
		if (counters) counters.checks++;
		scheduler.recordGate(detector.id, t, gate.pass, gate.signature);
		if (counters && gate.pass) counters.gatePasses++;
		const parsed = gate.pass && scheduler.shouldParse(detector.id, t);
		if (counters && gate.pass && !parsed) counters.suppressedParses++;
		gated.push({ detector, gate, parsed, events: [], actions: [] });
	}

	const parsing = gated.filter((outcome) => outcome.parsed);
	onGated?.(parsing.map((outcome) => outcome.detector.id));
	const addParseMs = (detector: Detector<DetectedEvent>, ms: number) => {
		if (telemetry) detectorTelemetry(telemetry, detector.id).parseMs += ms;
	};
	if (runSteps && parsing.length > 0) {
		const results = await runSteps(
			all(
				parsing.map(({ detector, gate }) =>
					timed(detector.parseSteps(current, t, gate, speculative), (ms) =>
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
			outcome.events = outcome.detector.parse(current, t, outcome.gate);
			if (telemetry)
				addParseMs(outcome.detector, performance.now() - parseStart);
		}
	}

	for (const outcome of parsing) {
		const { detector, events } = outcome;
		if (telemetry) detectorTelemetry(telemetry, detector.id).parses++;
		outcome.actions = events.map((event) => timeline.push(event));
		scheduler.recordParse(
			detector.id,
			t,
			outcome.actions.map((action, i) => parsedRead(events[i]!, action)),
		);
	}
	return gated;
}

function parsedRead(event: DetectedEvent, action: TimelineAction): ParsedRead {
	const standing = standingOf(action);
	return {
		type: event.type,
		kept: standing !== null,
		changed: changeOf(action) !== null,
		complete: standing !== null && isComplete(standing),
	};
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
