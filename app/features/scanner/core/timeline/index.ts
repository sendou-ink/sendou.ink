/**
 * TimelineBuilder: same-type events within a merge window collapse into one
 * (highest confidence kept); events below a confidence floor are dropped.
 * Each event kind declares its own window, content guard, floor and which read
 * of a run stays (`EventKind` in detectors/types.ts, listed in events.ts);
 * sampled kinds (per-frame state reads) keep the ends of every same-state run.
 * A scan has one timeline, pushed to by its frame pass (detectors/frame-pass.ts):
 * the analyzer worker's or the CLI's. Everything else follows it through the
 * keyed changes its pushes report.
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

/**
 * What a push did. `key` names the slot a kept read holds: a new one when
 * added, the replaced read's own otherwise, so a copy of the timeline kept
 * elsewhere (another thread, a store) follows it by key.
 */
export type TimelineAction =
	| { action: "added"; key: number; event: DetectedEvent }
	| {
			action: "replaced";
			key: number;
			event: DetectedEvent;
			replaced: DetectedEvent;
	  }
	/** a sampled run's trailing read moved forward: same stored slot, no new frame worth keeping */
	| {
			action: "extended";
			key: number;
			event: DetectedEvent;
			replaced: DetectedEvent;
	  }
	| { action: "merged"; into: DetectedEvent }
	| { action: "dropped"; reason: "low-confidence" };

/** An action that changed the timeline, as its owner reports it to whoever mirrors it. */
export interface TimelineChange {
	action: "added" | "replaced" | "extended";
	key: number;
	event: DetectedEvent;
}

/** One lane of a scan split into time slices: what its own timeline held. */
interface TimelineLane<E extends DetectedEvent> {
	/** seconds; where the lane's slice starts */
	tStart: number;
	events: readonly E[];
}

export class TimelineBuilder {
	readonly #events: DetectedEvent[];
	readonly #options: TimelineOptions;
	readonly #keys = new WeakMap<DetectedEvent, number>();
	#nextKey = 0;

	/** `held`: events of an earlier timeline, taken as they are. */
	constructor(
		options: Partial<TimelineOptions> = {},
		held: readonly DetectedEvent[] = [],
	) {
		this.#options = { ...DEFAULT_TIMELINE_OPTIONS, ...options };
		this.#events = held.toSorted((a, b) => a.t - b.t);
		for (const event of this.#events) this.#keys.set(event, this.#nextKey++);
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
		const window = this.windowOf(event.type);
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
		if (!near) return this.#add(event);
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

	/** Seconds within which reads of `type` merge. */
	windowOf(type: string): number {
		return kindOf(type)?.mergeWindowS ?? this.#options.mergeWindow;
	}

	#add(event: DetectedEvent): TimelineAction {
		const key = this.#nextKey++;
		this.#keys.set(event, key);
		this.#events.push(event);
		this.#events.sort((a, b) => a.t - b.t);
		return { action: "added", key, event };
	}

	#replace(
		kept: DetectedEvent,
		event: DetectedEvent,
		action: "replaced" | "extended" = "replaced",
	): TimelineAction {
		const key = this.#keys.get(kept)!;
		this.#keys.set(event, key);
		this.#events[this.#events.indexOf(kept)] = event;
		this.#events.sort((a, b) => a.t - b.t);
		return { action, key, event, replaced: kept };
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
				return this.#replace(prev, event, "extended");
			}
		}
		return this.#add(event);
	}
}

/** The action as a change to mirror; null when the push left the timeline as it was. */
export function changeOf(action: TimelineAction): TimelineChange | null {
	if (action.action === "merged" || action.action === "dropped") return null;
	return { action: action.action, key: action.key, event: action.event };
}

/**
 * One timeline out of the timelines of consecutive slices of the same footage
 * (a VoD's lanes, each scanned by its own worker). A lane's timeline is exact
 * within its slice; a screen standing across a seam was read on both sides,
 * so the reads a lane kept within their merge window of the next lane's start
 * are pushed into that lane's timeline, where they merge as later reads of
 * one scan would. A read that took over data of the one it replaced is a new
 * object: `onCarriedOver` gets it with the read it was made from.
 */
export function stitchLanes<E extends DetectedEvent>(
	lanes: readonly TimelineLane<E>[],
	onCarriedOver?: (event: E, from: E) => void,
): E[] {
	let stitched: E[] = [];
	for (const [i, lane] of lanes.entries()) {
		if (i === 0) {
			stitched = [...lane.events];
			continue;
		}
		// the generic record type survives the timeline: it stores the pushed objects, and a carry-over spreads the pushed one
		const timeline = new TimelineBuilder({}, lane.events);
		const reaches = (event: E) =>
			lane.tStart - event.t <= timeline.windowOf(event.type);
		const before = stitched.filter((event) => !reaches(event));
		for (const event of stitched.filter(reaches)) {
			const action = timeline.push(event);
			if (action.action === "replaced" && action.event !== event) {
				onCarriedOver?.(action.event as E, event);
			}
		}
		stitched = [...before, ...(timeline.events as readonly E[])];
	}
	return stitched.sort((a, b) => a.t - b.t);
}
