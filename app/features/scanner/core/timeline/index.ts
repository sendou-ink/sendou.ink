/**
 * TimelineBuilder: same-type events within a merge window collapse into one
 * (highest confidence kept); events below a confidence floor are dropped.
 * Each event kind declares its own window, content guard, floor and which read
 * of a run stays (`EventKind` in detectors/types.ts, listed in events.ts);
 * sampled kinds (per-frame state reads) keep the ends of every same-state run.
 */

import type { DetectedEvent } from "../events";
import { kindOf } from "../events";

export interface TimelineOptions {
	/** same-type events closer than this (seconds) merge, unless the kind sets its own window */
	mergeWindow: number;
	/** events below this confidence are dropped, unless the kind sets its own floor */
	minConfidence: number;
}

const DEFAULT_TIMELINE_OPTIONS: TimelineOptions = {
	mergeWindow: 30,
	minConfidence: 0.6,
};

export type TimelineAction =
	| { action: "added"; event: DetectedEvent }
	| { action: "replaced"; event: DetectedEvent; replaced: DetectedEvent }
	/** a sampled run's trailing read moved forward: same stored slot, no new frame worth keeping */
	| { action: "extended"; event: DetectedEvent; replaced: DetectedEvent }
	| { action: "merged"; into: DetectedEvent }
	| { action: "dropped"; reason: "low-confidence" };

export class TimelineBuilder {
	readonly #events: DetectedEvent[] = [];
	readonly #options: TimelineOptions;

	constructor(options: Partial<TimelineOptions> = {}) {
		this.#options = { ...DEFAULT_TIMELINE_OPTIONS, ...options };
	}

	get events(): readonly DetectedEvent[] {
		return this.#events;
	}

	push(event: DetectedEvent): TimelineAction {
		const kind = kindOf(event.type);
		if (
			event.confidence < (kind?.minConfidence ?? this.#options.minConfidence)
		) {
			return { action: "dropped", reason: "low-confidence" };
		}
		const window = kind?.mergeWindowS ?? this.#options.mergeWindow;
		const same = (a: DetectedEvent, b: DetectedEvent) =>
			kind?.sameData?.(a.data, b.data) ?? true;
		if (kind?.keep === "sampled") {
			return this.#pushSample(event, window, same);
		}
		const near = this.#events.find(
			(e) =>
				e.type === event.type &&
				Math.abs(e.t - event.t) <= window &&
				same(e, event),
		);
		if (!near) {
			this.#events.push(event);
			this.#events.sort((a, b) => a.t - b.t);
			return { action: "added", event };
		}
		const progress = kind?.progress?.(near.data, event.data) ?? 0;
		if (progress < 0) return { action: "merged", into: near };
		if (progress > 0) {
			return this.#replace(
				near,
				kind?.carryOver
					? // the kind's own data shape, erased by the lookup
						({
							...event,
							data: kind.carryOver(near.data, event.data),
						} as DetectedEvent)
					: event,
			);
		}
		if (event.confidence > near.confidence && kind?.keep !== "first") {
			return this.#replace(near, event);
		}
		return { action: "merged", into: near };
	}

	#replace(kept: DetectedEvent, event: DetectedEvent): TimelineAction {
		this.#events[this.#events.indexOf(kept)] = event;
		this.#events.sort((a, b) => a.t - b.t);
		return { action: "replaced", event, replaced: kept };
	}

	/**
	 * Same-state neighbours (by `t`) decide a sample's fate: none within the
	 * window → added; already bracketed by two → merged (a late-arriving VoD
	 * read); following the run's trailing read while the kept read before it is
	 * still within the window → extends, replacing that trailing read; otherwise
	 * added as the run's new trailing read.
	 */
	#pushSample(
		event: DetectedEvent,
		window: number,
		same: (a: DetectedEvent, b: DetectedEvent) => boolean,
	): TimelineAction {
		const continues = (earlier: DetectedEvent, later: DetectedEvent) =>
			later.t - earlier.t <= window && same(earlier, later);
		const sameType = this.#events.filter((e) => e.type === event.type);
		const nextIndex = sameType.findIndex((e) => e.t > event.t);
		const before = nextIndex === -1 ? sameType : sameType.slice(0, nextIndex);
		const next = nextIndex === -1 ? undefined : sameType[nextIndex];
		const prev = before.at(-1);
		const kept = before.at(-2);
		if (prev && continues(prev, event)) {
			if (prev.t === event.t || (next && continues(event, next))) {
				return { action: "merged", into: prev };
			}
			if (kept && continues(kept, prev) && continues(kept, event)) {
				this.#events[this.#events.indexOf(prev)] = event;
				this.#events.sort((a, b) => a.t - b.t);
				return { action: "extended", event, replaced: prev };
			}
		}
		this.#events.push(event);
		this.#events.sort((a, b) => a.t - b.t);
		return { action: "added", event };
	}
}
