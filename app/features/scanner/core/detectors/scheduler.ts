/**
 * DetectorScheduler: decides which detectors check frame t, and which pay
 * for a parse. Three concerns:
 *
 * - Cadence: `searchIntervalS` while a gate fails (default 0.25s — VoDs cut
 *   screens to ~1s, below raw-gameplay lifetimes), dense `refineIntervalS`
 *   once it passes, `checkIntervalS` as a hard cap exempt from suppression.
 *   `nextDueT()` lets the caller skip a frame's readback when nothing's due.
 * - Suppression: stops paying once a streak stagnates (`maxStagnantParses`
 *   + a time floor, since a gate can fire during a screen's entry animation
 *   before it's readable). `sufficientConfidence` suppresses immediately; a
 *   gate `signature` moving past `signatureTolerance` ends the streak
 *   (distinct browsed entries never drop those gates); `rearmCooldownS`
 *   adds a cooldown on top (death: animated-background flicker).
 * - Activity: tracks last gate pass + open-match state for the VoD scanner
 *   to skip dead air.
 *
 * State keys to the scan's clock; `t` jumping backwards resets everything.
 */

import type { DetectedEvent } from "./types";

export interface SchedulingInfo {
	id: string;
	checkIntervalS?: number;
	searchIntervalS?: number;
	refineIntervalS?: number;
	sufficientConfidence?: number;
	rearmCooldownS?: number;
	maxStagnantParses?: number;
}

export interface SchedulerOptions {
	/** false = one-shot harness mode: every detector due every frame, never suppressed */
	suppressSteadyFrames: boolean;
	/** check cadence while a gate is passing (per-detector refineIntervalS overrides) */
	refineIntervalS: number;
	/** check cadence while a gate is failing (per-detector searchIntervalS overrides) */
	searchIntervalS: number;
	/** non-improving parses tolerated before suppression (per-detector maxStagnantParses overrides) */
	maxStagnantParses: number;
	/** seconds without improvement tolerated before suppression */
	stagnantAfterS: number;
	/** minimum confidence gain that counts as an improvement */
	minImprovement: number;
	/**
	 * a signature cell moving more than this since the streak's last parse
	 * resets the streak (battle log browsing: static noise ≤2 per cell, entry flips ≥57)
	 */
	signatureTolerance: number;
	/** seconds without any gate pass before the scan counts as calm */
	quietAfterS: number;
	/** a match opened this long ago without closing is assumed abandoned */
	matchOpenMaxS: number;
	/** event types that open a match (map-start) */
	matchOpeningTypes: readonly string[];
	/** event types that close a match (the scoreboard family) */
	matchClosingTypes: readonly string[];
}

const DEFAULT_SCHEDULER_OPTIONS: SchedulerOptions = {
	suppressSteadyFrames: true,
	refineIntervalS: 0.15,
	searchIntervalS: 0.25,
	maxStagnantParses: 6,
	// ~3s for a screen to animate in and produce its best read, whatever the cadence
	stagnantAfterS: 3,
	minImprovement: 0.001,
	signatureTolerance: 12,
	quietAfterS: 15,
	matchOpenMaxS: 8 * 60,
	matchOpeningTypes: [],
	matchClosingTypes: [],
};

/** events below this are too dubious to drive match-open/close state */
const MATCH_STATE_MIN_CONFIDENCE = 0.6;

/** tolerated backwards jitter in t before the session counts as restarted */
const RESET_TOLERANCE_S = 5;

const INTERVAL_EPSILON_S = 1e-6;

interface StreakState {
	best: number;
	stagnant: number;
	lastImprovementT: number;
	suppressed: boolean;
	/** gate signature of the streak's last parsed frame */
	signature: readonly number[] | undefined;
}

interface DetectorState {
	info: SchedulingInfo;
	lastCheckT: number | undefined;
	gatePassing: boolean;
	streak: StreakState | null;
	/** signature reported by the latest passing gate */
	lastGateSignature: readonly number[] | undefined;
	/** parses skipped until this t after a sufficient read (rearmCooldownS) */
	parseHoldUntilT: number;
}

export class DetectorScheduler {
	#options: SchedulerOptions;
	#states = new Map<string, DetectorState>();
	#maxT = Number.NEGATIVE_INFINITY;
	#lastActivityT = Number.NEGATIVE_INFINITY;
	#matchOpenUntilT = Number.NEGATIVE_INFINITY;

	constructor(
		detectors: readonly SchedulingInfo[],
		options: Partial<SchedulerOptions> = {},
	) {
		this.#options = { ...DEFAULT_SCHEDULER_OPTIONS, ...options };
		for (const info of detectors) {
			this.#states.set(info.id, freshState(info));
		}
	}

	/** Drop all session state; `t` seeds the activity clock (chunk start). */
	reset(t = Number.NEGATIVE_INFINITY): void {
		for (const [id, state] of this.#states) {
			this.#states.set(id, freshState(state.info));
		}
		this.#maxT = t;
		this.#lastActivityT = t;
		this.#matchOpenUntilT = Number.NEGATIVE_INFINITY;
	}

	/** Earliest t any detector wants a check; frames before it skip analysis and readback. */
	nextDueT(): number {
		let next = Number.POSITIVE_INFINITY;
		for (const state of this.#states.values()) {
			if (state.lastCheckT === undefined) return Number.NEGATIVE_INFINITY;
			next = Math.min(next, state.lastCheckT + this.#interval(state));
		}
		return next;
	}

	/** Detector ids that should gate the frame at `t`. */
	dueDetectors(t: number): string[] {
		if (t + RESET_TOLERANCE_S < this.#maxT) this.reset(t);
		// first frame seeds the activity clock so a fresh session is never instantly calm
		if (this.#lastActivityT === Number.NEGATIVE_INFINITY) {
			this.#lastActivityT = t;
		}
		this.#maxT = Math.max(this.#maxT, t);
		const due: string[] = [];
		for (const [id, state] of this.#states) {
			if (state.lastCheckT === undefined) {
				due.push(id);
				continue;
			}
			if (t - state.lastCheckT >= this.#interval(state) - INTERVAL_EPSILON_S) {
				due.push(id);
			}
		}
		return due;
	}

	/** Report a gate outcome for a detector this scheduler marked due. */
	recordGate(
		id: string,
		t: number,
		pass: boolean,
		signature?: readonly number[],
	): void {
		const state = this.#states.get(id);
		if (!state) return;
		state.lastCheckT = t;
		state.gatePassing = pass;
		if (!pass) {
			state.streak = null;
			return;
		}
		this.#lastActivityT = Math.max(this.#lastActivityT, t);
		if (
			signature &&
			state.streak?.signature &&
			signaturesDiffer(
				signature,
				state.streak.signature,
				this.#options.signatureTolerance,
			)
		) {
			state.streak = null;
		}
		state.lastGateSignature = signature;
	}

	/** Whether the (passed) gate should be followed by a parse at `t`. */
	shouldParse(id: string, t: number): boolean {
		if (!this.#options.suppressSteadyFrames) return true;
		const state = this.#states.get(id);
		if (!state) return true;
		if (state.info.checkIntervalS !== undefined) return true;
		if (t < state.parseHoldUntilT) return false;
		return !state.streak?.suppressed;
	}

	/** Report the outcome of a parse this scheduler approved. */
	recordParse(
		id: string,
		t: number,
		events: readonly Pick<DetectedEvent, "type" | "confidence">[],
	): void {
		this.#recordMatchState(t, events);
		const state = this.#states.get(id);
		if (!state || state.info.checkIntervalS !== undefined) return;
		// no events counts as confidence 0 so a false-firing gate on a static screen stagnates too
		const confidence = events.reduce(
			(max, e) => Math.max(max, e.confidence),
			0,
		);
		const { sufficientConfidence, rearmCooldownS } = state.info;
		if (
			sufficientConfidence !== undefined &&
			confidence >= sufficientConfidence
		) {
			state.streak = {
				best: confidence,
				stagnant: 0,
				lastImprovementT: t,
				suppressed: true,
				signature: state.lastGateSignature,
			};
			if (rearmCooldownS !== undefined) {
				state.parseHoldUntilT = t + rearmCooldownS;
			}
			return;
		}
		if (!state.streak) {
			state.streak = {
				best: confidence,
				stagnant: 0,
				lastImprovementT: t,
				suppressed: false,
				signature: state.lastGateSignature,
			};
			return;
		}
		const streak = state.streak;
		streak.signature = state.lastGateSignature;
		if (confidence > streak.best + this.#options.minImprovement) {
			streak.best = confidence;
			streak.stagnant = 0;
			streak.lastImprovementT = t;
			return;
		}
		streak.stagnant += 1;
		const maxStagnant =
			state.info.maxStagnantParses ?? this.#options.maxStagnantParses;
		if (
			streak.stagnant >= maxStagnant &&
			t - streak.lastImprovementT >= this.#options.stagnantAfterS
		) {
			streak.suppressed = true;
		}
	}

	/** Dead air: no gate pass for quietAfterS and no open match, so the VoD scanner may skim keyframes. */
	calm(t: number): boolean {
		if (!this.#options.suppressSteadyFrames) return false;
		return (
			t - this.#lastActivityT >= this.#options.quietAfterS &&
			t >= this.#matchOpenUntilT
		);
	}

	#interval(state: DetectorState): number {
		if (!this.#options.suppressSteadyFrames) return 0;
		const { info } = state;
		if (info.checkIntervalS !== undefined) return info.checkIntervalS;
		const search = info.searchIntervalS ?? this.#options.searchIntervalS;
		// while suppressed only the gate runs (to spot the screen changing); search cadence suffices
		if (state.streak?.suppressed) return search;
		if (!state.gatePassing) return search;
		return info.refineIntervalS ?? this.#options.refineIntervalS;
	}

	#recordMatchState(
		t: number,
		events: readonly Pick<DetectedEvent, "type" | "confidence">[],
	): void {
		for (const event of events) {
			if (event.confidence < MATCH_STATE_MIN_CONFIDENCE) continue;
			if (this.#options.matchOpeningTypes.includes(event.type)) {
				this.#matchOpenUntilT = Math.max(
					this.#matchOpenUntilT,
					t + this.#options.matchOpenMaxS,
				);
			} else if (this.#options.matchClosingTypes.includes(event.type)) {
				this.#matchOpenUntilT = Math.min(this.#matchOpenUntilT, t);
			}
		}
	}
}

function freshState(info: SchedulingInfo): DetectorState {
	return {
		info,
		lastCheckT: undefined,
		gatePassing: false,
		streak: null,
		lastGateSignature: undefined,
		parseHoldUntilT: Number.NEGATIVE_INFINITY,
	};
}

function signaturesDiffer(
	a: readonly number[],
	b: readonly number[],
	tolerance: number,
): boolean {
	if (a.length !== b.length) return true;
	for (let i = 0; i < a.length; i++) {
		if (Math.abs(a[i]! - b[i]!) > tolerance) return true;
	}
	return false;
}
