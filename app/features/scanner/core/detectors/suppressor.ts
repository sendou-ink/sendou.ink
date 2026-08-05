/**
 * ParseSuppressor: bails out of re-parsing a static screen.
 *
 * A screen that keeps a detector's gate firing (the results scoreboard can
 * sit for tens of seconds, a paused VoD indefinitely) makes the pipeline
 * re-run the expensive parse() on every sampled frame even though nothing
 * changes. Per detector this tracks the best event confidence seen during a
 * continuous gate-pass streak; once `maxStagnantParses` consecutive parses
 * fail to improve on it, parse() is skipped (the cheap gate keeps running)
 * until the gate drops — i.e. the screen actually changed.
 */

export interface SuppressorOptions {
	/** consecutive non-improving parses tolerated before suppression kicks in */
	maxStagnantParses: number;
	/** minimum confidence gain that counts as an improvement */
	minImprovement: number;
}

const DEFAULT_SUPPRESSOR_OPTIONS: SuppressorOptions = {
	// at the 2fps sample rate: give a stable screen ~3s to produce its best
	// read, then stop paying for parses until the screen changes
	maxStagnantParses: 6,
	minImprovement: 0.001,
};

interface StreakState {
	best: number;
	stagnant: number;
	suppressed: boolean;
}

export class ParseSuppressor {
	#options: SuppressorOptions;
	#streaks = new Map<string, StreakState>();

	constructor(options: Partial<SuppressorOptions> = {}) {
		this.#options = { ...DEFAULT_SUPPRESSOR_OPTIONS, ...options };
	}

	/**
	 * Call once per detector per frame with the gate outcome; returns whether
	 * parse() should run. A failed gate ends the streak, so the next gate pass
	 * starts a fresh, unsuppressed streak.
	 */
	shouldParse(detectorId: string, gatePass: boolean): boolean {
		if (!gatePass) {
			this.#streaks.delete(detectorId);
			return false;
		}
		return !this.#streaks.get(detectorId)?.suppressed;
	}

	/** Report the outcome of a parse this suppressor approved. */
	recordParse(
		detectorId: string,
		events: readonly { confidence: number }[],
	): void {
		// no events counts as confidence 0: a false-firing gate on a static
		// screen stagnates and gets suppressed just like a parsed one
		const confidence = events.reduce(
			(max, e) => Math.max(max, e.confidence),
			0,
		);
		const streak = this.#streaks.get(detectorId);
		if (!streak) {
			this.#streaks.set(detectorId, {
				best: confidence,
				stagnant: 0,
				suppressed: false,
			});
			return;
		}
		if (confidence > streak.best + this.#options.minImprovement) {
			streak.best = confidence;
			streak.stagnant = 0;
			return;
		}
		streak.stagnant += 1;
		if (streak.stagnant >= this.#options.maxStagnantParses)
			streak.suppressed = true;
	}
}
