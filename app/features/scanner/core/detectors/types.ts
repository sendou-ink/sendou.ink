import type { Mat } from "../cv";
import type { MatchSteps } from "../match-steps";

/** One read of an event kind; `DetectedEvent` (core/events.ts) is the union over every kind. */
export interface EventRecord<TType extends string = string, TData = unknown> {
	type: TType;
	/** seconds into the stream/video */
	t: number;
	/** 0..1 aggregate confidence; TimelineBuilder drops events below the kind's floor */
	confidence: number;
	data: TData;
	/** per-field match scores etc. for the harness/debugging; not persisted upstream */
	debug?: Record<string, unknown>;
}

/**
 * An event kind: its type, its data shape and how the timeline and the
 * scheduler treat its reads. Declared next to the detector that emits it and
 * listed in core/events.ts.
 */
export interface EventKind<TType extends string = string, TData = unknown> {
	type: TType;
	/**
	 * Same-kind reads closer than this (seconds) merge; unset = the timeline
	 * default. Repeatable events need a window shorter than the spacing between
	 * two real occurrences.
	 */
	mergeWindowS?: number;
	/**
	 * Content guard: reads inside the window merge only when this holds, for
	 * screens whose distinct occurrences can appear seconds apart (replay
	 * browsing) and need content, not time, to split.
	 */
	sameData?(a: TData, b: TData): boolean;
	/**
	 * Reads below this confidence are dropped; unset = the timeline default.
	 * Evidence scored on a different scale (raw NCC peaks) opts out with 0,
	 * history screens raise it.
	 */
	minConfidence?: number;
	/**
	 * Which read of a merged run stays; unset = "mostConfident".
	 *
	 * "first": the content guard only merges identical repeats, so a more
	 * confident one carries nothing new except a later `t`.
	 *
	 * "sampled": per-frame state samples, where every read carries state at its
	 * instant and a run of same-state reads is a series rather than one repeated
	 * screen. The timeline keeps the run's first read, the latest read
	 * (re-placed as the run grows, `extended`) and one read per merge window in
	 * between, so the run's ends are exact and a lone misread stays flanked by
	 * the reads either side of it for the match builder's smoothing. Confidence
	 * never moves a sample.
	 */
	keep?: "mostConfident" | "first" | "sampled";
	/**
	 * Animation order for screens that count toward their final value (X Battle
	 * cards): positive when `b` is further along than `a`. Every frame of the
	 * count reads equally well, so instead of confidence a further-along read
	 * replaces the kept one and an earlier one merges into it; only reads level
	 * on the animation fall back to confidence.
	 */
	progress?(a: TData, b: TData): number;
	/**
	 * Data a further-along read takes over from the read it replaces: an
	 * earlier frame of the animation can show what the later one has moved past.
	 */
	carryOver?(kept: TData, further: TData): TData;
	/** a confident read opens a match (the intro) or closes it (a scoreboard) for the scheduler's calm state */
	match?: "opens" | "closes";
}

/** The event record an `EventKind` declares. */
export type EventOf<TKind> =
	TKind extends EventKind<infer TType, infer TData>
		? EventRecord<TType, TData>
		: never;

export interface GateResult {
	pass: boolean;
	/** raw score of the gate check, for tuning */
	score: number;
	/** screen variant the gate recognized (minimap: "overlay" | "spectator"); parse() branches on it */
	variant?: string;
	/**
	 * coarse content fingerprint (image.ts roiSignature); the scheduler re-arms a
	 * suppressed streak when it moves (browsing battle log / replay entries)
	 */
	signature?: number[];
}

/**
 * Recognizes one event type on a canonical 1920x1080 RGBA frame. gate() must be
 * cheap; parse() runs only when it passes and must also cope without the gate
 * result so one-shot tools can call it directly.
 */
export interface Detector<TEvent extends EventRecord = EventRecord> {
	id: string;
	/**
	 * Minimum seconds between checks in both scheduling phases. Also exempts the
	 * detector from steady-frame suppression: it marks a long-lived screen with
	 * changing content, which stagnation suppression would wrongly silence.
	 */
	checkIntervalS?: number;
	/**
	 * Check cadence while the gate fails; unset = scheduler default (0.25s).
	 * Produced VoDs cut screens to ~1s with flicker inside, so the cadence must
	 * sample that several times; gates cost ~1.6ms so only override upward with
	 * strong evidence.
	 */
	searchIntervalS?: number;
	/**
	 * Check cadence while the gate passes; unset = scheduler default (0.15s).
	 * Only for expensive parses, and must still sample a screen's lifetime
	 * several times.
	 */
	refineIntervalS?: number;
	/** Non-improving parses tolerated before suppression; unset = default (6). Lower for expensive parses. */
	maxStagnantParses?: number;
	/**
	 * A parse at this confidence ends refinement immediately. Set just under the
	 * detector's measured clean-read floor (fixtures + confirmed scan events) so
	 * the first full read suppresses the rest; degraded reads fall back to
	 * stagnation suppression.
	 */
	sufficientConfidence?: number;
	/**
	 * After a sufficient read, skip parses this long even across gate drops
	 * (death: animated background flickers the gate). Only safe when the
	 * timeline merge is purely time-based and the cooldown fits inside the merge
	 * window.
	 */
	rearmCooldownS?: number;
	/** false = events ship without the frame PNG; for continuously firing events that would balloon IndexedDB */
	attachFrame?: boolean;
	gate(frame: Mat): GateResult;
	parse(frame: Mat, t: number, gate?: GateResult): TEvent[];
	/**
	 * parse() as match steps (match-steps.ts) for a batching driver; `parse`
	 * must equal runSync of it. `speculative` prefetches candidate sets.
	 */
	parseSteps(
		frame: Mat,
		t: number,
		gate: GateResult | undefined,
		speculative: boolean,
	): MatchSteps<TEvent[]>;
}
