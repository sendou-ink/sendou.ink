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
	gate(frame: Mat): GateResult;
	parse(frame: Mat, t: number, gate?: GateResult): DetectedEvent<TData>[];
}
