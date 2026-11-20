/**
 * The bookkeeping of a VoD decode stream (worker/frame-source.ts) between
 * the packets it feeds and the samples it hands on: every sample goes out in
 * presentation order, decoded or not. On AV1, H.264 and HEVC each packet is
 * one sample, known as it is fed (`perPacket`); H.264/HEVC packets come in
 * decode order (`reorders`, B-frames), so a sample left undecoded is held
 * until the decoder has emitted a later one: by then every packet presented
 * before it has been fed. The scheduler's check plan is judged here too: its
 * tracker is stepped through the samples in presentation order, lazily, at
 * the moment a verdict needs every sample before it.
 */
import { type CheckPlan, createCheckTracker } from "./detectors/check-plan";

export interface DecodeOrderEntry {
	t: number;
	state: "decoding" | "previewing" | "ready";
	/** left undecoded: below the floor or the seek, or `byPlan` */
	skipped: boolean;
	/** left undecoded because the check plan reaches no check there */
	byPlan: boolean;
}

export interface DecodeOrder<E extends DecodeOrderEntry> {
	/**
	 * A packet's sample at `t` is about to be fed. One presented before a
	 * sample the plan already judged means the verdicts may have missed it: the
	 * plan is not consulted again, and if it already let a later sample go
	 * undecoded the stream cannot be trusted (throws).
	 */
	admit(t: number): void;
	/** Takes the fed packet's (or, without `perPacket`, the emitted sample's) entry in. */
	add(entry: E): void;
	/** Whether a detector pass may run on the sample at `t` under `plan`; every sample before it fed. */
	wanted(t: number, plan: CheckPlan | null): boolean;
	/**
	 * The decoder emitted the sample at `t`: its entry, null when it is not the
	 * next one decoding. Fed samples before it that never came are forgotten.
	 */
	emitted(t: number): E | null;
	/** The next entry to hand on, null while none may go yet. `draining`: nothing more is fed before it (a flush). */
	next(draining: boolean): E | null;
	/** Forgets every sample still decoding: the decoder was flushed and will not emit them. */
	forgetUnemitted(): void;
	/** The stream jumped to another keyframe: the tracker starts over. */
	jump(): void;
	/** Entries fed to the decoder and not emitted yet. */
	decoding(): number;
	entries(): readonly E[];
}

/** The bookkeeping of one stream; samples before `firstT` are never handed on. */
export function createDecodeOrder<E extends DecodeOrderEntry>({
	perPacket,
	reorders,
	firstT,
}: {
	perPacket: boolean;
	reorders: boolean;
	firstT: number;
}): DecodeOrder<E> {
	const pending: E[] = [];
	const tracker = createCheckTracker();
	let plan: CheckPlan | null = null;
	/** fed samples the tracker has not stepped yet, in presentation order */
	const unstepped: number[] = [];
	let steppedT = Number.NEGATIVE_INFINITY;
	/** the plan's verdicts hold: the tracker steps every sample in presentation order */
	let planHolds = true;
	/** the latest sample the decoder emitted: every packet presented before it has been fed */
	let emittedT = Number.NEGATIVE_INFINITY;

	const stepThrough = (t: number) => {
		while (unstepped.length > 0 && unstepped[0]! <= t) {
			steppedT = unstepped.shift()!;
			tracker.step(steppedT);
		}
	};
	/**
	 * A fed sample the decoder will not emit (mediabunny drops an HEVC
	 * stream's leading RASL pictures, a decoder may drop a broken frame) never
	 * comes, as on the other codecs. The tracker stepped it, so from the first
	 * sample on the plan is not consulted again.
	 */
	const forgetDecodingBefore = (before: number) => {
		for (let i = pending.length - 1; i >= 0; i--) {
			const entry = pending[i]!;
			if (entry.state !== "decoding" || entry.t >= before) continue;
			pending.splice(i, 1);
			if (entry.t >= firstT) planHolds = false;
		}
	};

	return {
		admit(t) {
			if (t > steppedT) {
				insertSorted(unstepped, t, (x) => x);
				return;
			}
			planHolds = false;
			if (pending.some((entry) => entry.byPlan && entry.t > t)) {
				throw new Error(
					`packet at ${t}s came after the plan let a later sample go undecoded`,
				);
			}
		},
		add(entry) {
			if (perPacket) insertSorted(pending, entry, (e) => e.t);
			else pending.push(entry);
		},
		wanted(t, next) {
			if (!perPacket || !planHolds) return true;
			if (next !== plan) {
				plan = next;
				tracker.setPlan(plan);
			}
			stepThrough(t);
			return tracker.wanted(t);
		},
		emitted(t) {
			emittedT = Math.max(emittedT, t);
			// samples come out in presentation order
			if (perPacket) forgetDecodingBefore(t);
			const entry = pending.find((e) => e.state === "decoding");
			return entry && entry.t === t ? entry : null;
		},
		next(draining) {
			const head = pending[0];
			if (head?.state !== "ready") return null;
			// a packet fed later may still be presented before it
			if (reorders && head.skipped && !draining && head.t > emittedT) {
				return null;
			}
			pending.shift();
			if (perPacket && planHolds) stepThrough(head.t);
			return head;
		},
		forgetUnemitted() {
			forgetDecodingBefore(Number.POSITIVE_INFINITY);
		},
		jump() {
			tracker.clear();
			unstepped.length = 0;
			steppedT = Number.NEGATIVE_INFINITY;
		},
		decoding() {
			let count = 0;
			for (const entry of pending) if (entry.state === "decoding") count++;
			return count;
		},
		entries() {
			return pending;
		},
	};
}

/** Inserts `value` into `list` (ascending by `key`), after any equal to it. */
function insertSorted<T>(list: T[], value: T, key: (value: T) => number): void {
	let index = list.length;
	while (index > 0 && key(list[index - 1]!) > key(value)) index--;
	list.splice(index, 0, value);
}
