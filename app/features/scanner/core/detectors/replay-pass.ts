/**
 * The frame pass of a logged scan (core/scan-log.ts), run again. The logged
 * detectors are due and the logged verdicts stand in for the scheduler, so
 * the detectors are shown the frames the scan showed them, in its order, and
 * build the same state. The replay's pixels can differ from the scan's
 * (another decoder or color conversion). Every decision therefore follows the
 * log: a gate the replay's pixels decide differently takes the logged verdict,
 * and a parse reading the same events takes their logged confidences, so the
 * timeline keeps the reads the scan's kept. Only the events' data is the
 * replay's own. Each gate and read that came out differently is reported.
 */
import type { Mat } from "../cv";
import type { DetectedEvent } from "../events";
import * as ScanLog from "../scan-log";
import type { TimelineBuilder } from "../timeline/index";
import {
	type DetectorOutcome,
	runDetectorPass,
	type StepsRunner,
} from "./frame-pass";
import type { ScanTelemetry } from "./telemetry";
import type { Detector, GateResult } from "./types";

/** Where a replayed pass differs from the scan's own. */
export type ReplayDivergence =
	| {
			kind: "gate";
			detector: string;
			logged: Pick<GateResult, "pass" | "variant">;
			replayed: Pick<GateResult, "pass" | "variant">;
	  }
	| {
			kind: "reads";
			detector: string;
			logged: readonly ScanLog.ScanLogRead[];
			replayed: readonly ScanLog.ScanLogRead[];
	  }
	/** the scan checked a detector this build does not have */
	| { kind: "detector"; detector: string };

/**
 * Runs the pass the scan ran on `logged`'s frame over `frame`, which must be
 * the same picture; `detectors` and `timeline` are the replayed lane's own.
 */
export async function replayDetectorPass({
	frame,
	logged,
	detectors,
	timeline,
	telemetry,
	runSteps,
}: {
	frame: Mat;
	logged: ScanLog.ScanLogFrame;
	detectors: readonly Detector<DetectedEvent>[];
	timeline: TimelineBuilder;
	telemetry: ScanTelemetry | null;
	runSteps?: StepsRunner;
}): Promise<{ outcomes: DetectorOutcome[]; divergences: ReplayDivergence[] }> {
	const checks = new Map(logged.checks.map((check) => [check.detector, check]));
	const divergences: ReplayDivergence[] = [];
	for (const detector of checks.keys()) {
		if (!detectors.some(({ id }) => id === detector)) {
			divergences.push({ kind: "detector", detector });
		}
	}
	/** per detector, what its parse read before taking the logged confidences */
	const ownReads = new Map<string, ScanLog.ScanLogRead[]>();

	const outcomes = await runDetectorPass({
		frame,
		t: logged.t,
		detectors: detectors.map((detector) => {
			const check = checks.get(detector.id);
			return check
				? followingLog(detector, check, divergences, ownReads)
				: detector;
		}),
		due: [...checks.keys()],
		scheduler: {
			recordGate: () => {},
			shouldParse: (id) => checks.get(id)?.parsed ?? false,
			recordParse: () => {},
		},
		timeline,
		telemetry,
		runSteps,
	});

	for (const [detector, replayed] of ownReads) {
		const { reads } = checks.get(detector)!;
		if (!sameReads(reads, replayed)) {
			divergences.push({ kind: "reads", detector, logged: reads, replayed });
		}
	}
	return { outcomes, divergences };
}

/** `detector` reporting the logged gate verdict wherever its own differs, and its reads at their logged confidences. */
function followingLog(
	detector: Detector<DetectedEvent>,
	check: ScanLog.ScanLogCheck,
	divergences: ReplayDivergence[],
	ownReads: Map<string, ScanLog.ScanLogRead[]>,
): Detector<DetectedEvent> {
	const asLogged = (events: DetectedEvent[]): DetectedEvent[] => {
		ownReads.set(detector.id, ScanLog.readsOf(events));
		const sameEvents =
			events.length === check.reads.length &&
			events.every((event, i) => event.type === check.reads[i]!.type);
		return sameEvents
			? events.map((event, i) => ({
					...event,
					confidence: check.reads[i]!.confidence,
				}))
			: events;
	};
	return {
		...detector,
		gate(frame) {
			const own = detector.gate(frame);
			const agrees =
				own.pass === check.pass &&
				(!check.pass || own.variant === check.variant);
			if (agrees) return own;
			divergences.push({
				kind: "gate",
				detector: detector.id,
				logged: { pass: check.pass, variant: check.variant },
				replayed: { pass: own.pass, variant: own.variant },
			});
			return {
				...own,
				pass: check.pass,
				variant: check.pass ? check.variant : own.variant,
			};
		},
		parse: (frame, t, gate) => asLogged(detector.parse(frame, t, gate)),
		*parseSteps(frame, t, gate, speculative) {
			return asLogged(yield* detector.parseSteps(frame, t, gate, speculative));
		},
	};
}

function sameReads(
	a: readonly ScanLog.ScanLogRead[],
	b: readonly ScanLog.ScanLogRead[],
): boolean {
	return (
		a.length === b.length &&
		a.every(
			(read, i) =>
				read.type === b[i]!.type && read.confidence === b[i]!.confidence,
		)
	);
}
