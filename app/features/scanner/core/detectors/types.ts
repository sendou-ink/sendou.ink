import type { Mat } from "../cv";

export interface DetectedEvent<TData = unknown> {
	type: string;
	/** seconds into the stream/video */
	t: number;
	/** 0..1 aggregate confidence; TimelineBuilder drops events below threshold */
	confidence: number;
	data: TData;
	/** per-field match scores etc. for the harness/debugging; not persisted upstream */
	debug?: Record<string, unknown>;
}

export interface GateResult {
	pass: boolean;
	/** raw score of the gate check, for tuning */
	score: number;
	/**
	 * which screen variant the gate recognized, for detectors that gate more
	 * than one (minimap: "overlay" | "spectator") — parse() branches on it
	 * instead of re-running the gate probes
	 */
	variant?: string;
	/**
	 * coarse content fingerprint (grid-cell means over content ROIs, see
	 * image.ts roiSignature) — the scheduler re-arms a suppressed streak
	 * when it moves, for screens whose distinct real occurrences keep the
	 * gate passing (browsing battle log / replay entries)
	 */
	signature?: number[];
}

/**
 * A detector recognizes one event type on a canonical 1920x1080 RGBA frame.
 * gate() must be cheap (probes / tiny template match); parse() may be expensive
 * and only runs when gate() passes. Callers pass the gate result they already
 * computed into parse(); a detector must still cope without it (re-deriving
 * whatever it needs) so one-shot tools can call parse() directly.
 */
export interface Detector<TData = unknown> {
	id: string;
	/**
	 * Minimum seconds between checks in *both* scheduling phases: frames
	 * inside the interval skip gate and parse entirely
	 * (core/detectors/scheduler.ts, applied by the analyzer worker). Also
	 * exempts the detector from steady-frame suppression: it marks a screen
	 * that stays up for minutes with *changing* content, which the
	 * stagnating-confidence heuristic would wrongly silence.
	 */
	checkIntervalS?: number;
	/**
	 * Check cadence while the gate keeps failing (the search phase); unset =
	 * the scheduler's default (0.25s). Don't reason from raw-gameplay screen
	 * lifetimes here: produced/casted VoDs cut screens (results, intros) to
	 * as little as ~1s with transition flicker eating frames inside that
	 * window, so the search cadence must sample it several times. Gates
	 * cost ~1.6ms, so searching at the analysis floor is effectively free;
	 * only override upward with strong evidence.
	 */
	searchIntervalS?: number;
	/**
	 * Check cadence while the gate is passing (the refine phase); unset =
	 * the scheduler's dense default (0.15s). Only for detectors whose parse
	 * is expensive enough that refining at the dense cadence multiplies
	 * real cost — the sparser cadence still has to sample the screen's
	 * lifetime several times.
	 */
	refineIntervalS?: number;
	/**
	 * Consecutive non-improving parses tolerated before stagnation
	 * suppression; unset = the scheduler's default (6). Lower for expensive
	 * parses to cap the worst-case cost of a stagnant streak.
	 */
	maxStagnantParses?: number;
	/**
	 * A parse reaching this confidence ends the streak's refinement
	 * immediately: the timeline keeps the best read per merge window, so a
	 * read this good cannot be improved upon in any way that matters.
	 * Set just under the detector's measured clean-read confidence floor
	 * (fixture-suite reads + confirmed scan events), so a streak's first
	 * full read suppresses the rest; degraded-footage reads below the
	 * floor fall back to stagnation-based suppression.
	 */
	sufficientConfidence?: number;
	/**
	 * After a sufficient read, skip parses for this long even across gate
	 * drops — for overlays whose animated background flickers the gate
	 * (death). Only safe when the event type's timeline merge is purely
	 * time-based and the cooldown fits inside the merge window, so every
	 * parse the cooldown skips would have merged into the same event anyway.
	 */
	rearmCooldownS?: number;
	/**
	 * false = worker results for this detector's events ship without the
	 * analyzed-frame PNG — for detectors whose events fire continuously,
	 * where a stored frame per event would balloon IndexedDB.
	 */
	attachFrame?: boolean;
	gate(frame: Mat): GateResult;
	parse(frame: Mat, t: number, gate?: GateResult): DetectedEvent<TData>[];
}
