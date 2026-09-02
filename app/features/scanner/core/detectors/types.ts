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
export interface Detector<TData = unknown> {
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
	parse(frame: Mat, t: number, gate?: GateResult): DetectedEvent<TData>[];
}
