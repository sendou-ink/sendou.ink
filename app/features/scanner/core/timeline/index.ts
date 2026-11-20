/**
 * TimelineBuilder: same-type events within a merge window collapse into one,
 * each of its scored fields voted across the run's reads; a read whose field
 * scores average under a floor is dropped. Each event kind declares its own
 * window, content guard, floor and how a run becomes the read kept
 * (`EventKind` in detectors/types.ts, listed in events.ts); per-frame state
 * reads are all kept.
 * A scan has one timeline, pushed to by its frame pass (detectors/frame-pass.ts):
 * the analyzer worker's or the CLI's. Everything else follows it through the
 * keyed changes its pushes report.
 */

import type { DetectedEvent } from "../events";
import { isComplete, kindOf } from "../events";
import * as FieldScores from "../field-scores";

export interface TimelineOptions {
	/** same-type events closer than this (seconds) merge, unless the kind sets its own window */
	mergeWindow: number;
	/** reads whose field scores average under this are dropped, unless the kind sets its own floor */
	minMeanScore: number;
}

const DEFAULT_TIMELINE_OPTIONS: TimelineOptions = {
	mergeWindow: 30,
	minMeanScore: 0.6,
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
	/** a read outvoted fields of the kept one, which stays the slot's frame and `t` */
	| {
			action: "amended";
			key: number;
			event: DetectedEvent;
			replaced: DetectedEvent;
	  }
	| { action: "merged"; into: DetectedEvent }
	| { action: "dropped"; reason: "low-score" };

/** An action that changed the timeline, as its owner reports it to whoever mirrors it. */
export interface TimelineChange {
	action: "added" | "replaced" | "amended";
	key: number;
	event: DetectedEvent;
}

/** Whether the change's read is the one its slot's frame shows (the other changes keep the slot's frame). */
export function bringsFrame(action: TimelineChange["action"]): boolean {
	return action === "added" || action === "replaced";
}

/** The kept read a pushed one now belongs to; null when it was dropped. */
export function standingOf(action: TimelineAction): DetectedEvent | null {
	if (action.action === "dropped") return null;
	return action.action === "merged" ? action.into : action.event;
}

/** One value read for a field, with the score its reads back it with. */
interface Candidate {
	value: unknown;
	/** summed score of the reads holding the value */
	weight: number;
	/** the best single score among them */
	best: number;
}

/** The votes of a kept read's run. */
interface Run {
	/** the read whose `t` and unscored data the kept read shows */
	base: DetectedEvent;
	/** per field, every value read for it by its JSON */
	candidates: Map<string, Map<string, Candidate>>;
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
	/** by slot key; a slot without one (an event held from an earlier timeline) starts from its kept read */
	readonly #runs = new Map<number, Run>();
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
		const floor =
			kindOf(event.type)?.minMeanScore ?? this.#options.minMeanScore;
		if (FieldScores.mean(event.scores) < floor) {
			return { action: "dropped", reason: "low-score" };
		}
		return this.pushKept(event);
	}

	/** `push` for a read another timeline already kept: the floor is not asked again. */
	pushKept(event: DetectedEvent): TimelineAction {
		const kind = kindOf(event.type);
		const window = this.windowOf(event.type);
		const same = (a: DetectedEvent, b: DetectedEvent) =>
			kind?.sameData?.(a.data, b.data) ?? true;
		if (kind?.keep === "every") return this.#add(event);
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
			// what the earlier frames read is behind the animation: their votes go
			this.#runs.delete(this.#keys.get(near)!);
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
		if (kind?.keep === "first") return { action: "merged", into: near };
		return this.#vote(near, event);
	}

	/** Seconds within which reads of `type` merge. */
	windowOf(type: string): number {
		return kindOf(type)?.mergeWindowS ?? this.#options.mergeWindow;
	}

	#add(event: DetectedEvent): TimelineAction {
		const key = this.#nextKey++;
		this.#keys.set(event, key);
		// reads arrive mostly in order; after every read at the same `t`, as a stable sort would place it
		let at = this.#events.length;
		while (at > 0 && this.#events[at - 1]!.t > event.t) at--;
		this.#events.splice(at, 0, event);
		return { action: "added", key, event };
	}

	/**
	 * Adds `event`'s votes to the run `kept` stands for. The read kept is the
	 * run's base (the read agreeing with the vote on the most fields, the
	 * earlier one on a tie) showing every field's winner. A read that moves
	 * neither the base nor a field's value is merged, unless it completes the
	 * kept read: rescoring alone would otherwise re-store it on every frame.
	 */
	#vote(kept: DetectedEvent, event: DetectedEvent): TimelineAction {
		const key = this.#keys.get(kept)!;
		const run = this.#runs.get(key) ?? runOf(kept);
		this.#runs.set(key, run);
		castVotes(run, event);
		const winners = winnersOf(run);
		const rebased = agreement(event, winners) > agreement(run.base, winners);
		if (rebased) run.base = event;
		const standing = withWinners(run.base, winners);
		if (
			!rebased &&
			sameJson(standing.data, kept.data) &&
			(isComplete(kept) || !isComplete(standing))
		) {
			return { action: "merged", into: kept };
		}
		return this.#replace(kept, standing, rebased ? "replaced" : "amended");
	}

	#replace(
		kept: DetectedEvent,
		event: DetectedEvent,
		action: "replaced" | "amended" = "replaced",
	): TimelineAction {
		const key = this.#keys.get(kept)!;
		this.#keys.set(event, key);
		this.#events[this.#events.indexOf(kept)] = event;
		this.#events.sort((a, b) => a.t - b.t);
		return { action, key, event, replaced: kept };
	}
}

function runOf(event: DetectedEvent): Run {
	const run: Run = { base: event, candidates: new Map() };
	castVotes(run, event);
	return run;
}

/** A field left unread casts no vote: its score says how badly it read, not that it is empty. */
function castVotes(run: Run, event: DetectedEvent): void {
	for (const [field, score] of Object.entries(event.scores)) {
		const value = FieldScores.valueAt(event.data, field);
		if (!FieldScores.isRead(value)) continue;
		const values = run.candidates.get(field) ?? new Map<string, Candidate>();
		run.candidates.set(field, values);
		const id = JSON.stringify(value);
		const candidate = values.get(id);
		if (candidate) {
			candidate.weight += score;
			candidate.best = Math.max(candidate.best, score);
		} else {
			values.set(id, { value, weight: score, best: score });
		}
	}
}

/** Per field the value backed by the most score; the one read first on a tie. */
function winnersOf(run: Run): Map<string, Candidate> {
	const winners = new Map<string, Candidate>();
	for (const [field, values] of run.candidates) {
		let winner: Candidate | undefined;
		for (const candidate of values.values()) {
			if (!winner || candidate.weight > winner.weight) winner = candidate;
		}
		if (winner) winners.set(field, winner);
	}
	return winners;
}

/** How many fields the read holds the winning value of. */
function agreement(
	event: DetectedEvent,
	winners: ReadonlyMap<string, Candidate>,
): number {
	let agreed = 0;
	for (const [field, winner] of winners) {
		if (!(field in event.scores)) continue;
		if (sameJson(FieldScores.valueAt(event.data, field), winner.value)) {
			agreed++;
		}
	}
	return agreed;
}

/** `base` showing every field's winner, scored at the winner's best read; `base` itself when it already does. */
function withWinners(
	base: DetectedEvent,
	winners: ReadonlyMap<string, Candidate>,
): DetectedEvent {
	let data: unknown = base.data;
	const scores: Record<string, number> = { ...base.scores };
	let rescored = false;
	for (const [field, winner] of winners) {
		if (!sameJson(FieldScores.valueAt(data, field), winner.value)) {
			data = FieldScores.withValueAt(data, field, winner.value);
		}
		if (scores[field] === winner.best) continue;
		scores[field] = winner.best;
		rescored = true;
	}
	if (data === base.data && !rescored) return base;
	// `type` and `data` stay one member of the union: only values of its own fields were exchanged
	return { ...base, data, scores } as DetectedEvent;
}

function sameJson(a: unknown, b: unknown): boolean {
	return a === b || JSON.stringify(a) === JSON.stringify(b);
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
 * one scan would. A read made of two (fields voted, or data carried over) is
 * a new object: `onCarriedOver` gets it with the read whose `t` it kept.
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
			const action = timeline.pushKept(event);
			if (action.action === "replaced" && action.event !== event) {
				onCarriedOver?.(action.event as E, event);
			} else if (action.action === "amended") {
				onCarriedOver?.(action.event as E, action.replaced as E);
			}
		}
		stitched = [...before, ...(timeline.events as readonly E[])];
	}
	return stitched.sort((a, b) => a.t - b.t);
}
