/**
 * The game clock tracked over a game's timer reads instead of trusting each
 * read on its own. Once the clock is seen running, every later read is
 * predicted from its anchor, the moment the display reaches 0:00 (`zero`,
 * `t + time` of a running read), and verified against it:
 *
 * - a read on the anchor confirms it, and so does a held display: the clock
 *   shows its full length (5:00, 3:00) until the game starts and stands at
 *   0:01 through overtime, while `t` runs on;
 * - a lone read off the anchor is a misread of the digits: it stays on the
 *   anchor, its time the anchor's prediction;
 * - two reads off the anchor that agree on another one, the clock seen
 *   running between them, break it: the footage moved to another moment of
 *   the game (a broadcast replay, an edited VoD's cut) or another game.
 *
 * Each anchor holds a span of reads, consecutive in time. Live play never
 * shows a moment again, so within one game the zero only moves earlier (an
 * edited VoD cuts ahead, live footage keeps it); a span whose zero is later
 * than the span before it re-runs a moment already played. The live spans are
 * the heaviest chain of non-increasing zeros, as a displayed count's longest
 * non-increasing run is the true one.
 */

/** Reads further apart from an anchor than this are off it: frames land on either side of a tick, a live capture's timestamps jitter by up to half a second. */
const ANCHOR_TOLERANCE_SECONDS = 1.5;

/** What the clock shows before the game starts: ranked and Turf War lengths. */
const CLOCK_LENGTHS_SECONDS: readonly number[] = [300, 180];

/** The display holds here once the clock runs out (overtime). */
const OVERTIME_DISPLAY_MAX_SECONDS = 1;

/**
 * A span first read this far into its clock, or on the full-length hold before
 * GO (1-3 s), starts a game: the counter is read from GO on. A broadcast's
 * post-game replay of the opening moments starts later (the SWS26 REWOUND VoD
 * replays from 4:43).
 */
const GAME_START_MAX_ELAPSED_SECONDS = 8;
const GAME_START_MAX_HOLD_SECONDS = 5;

/**
 * The next game's zero lies a whole clock (Turf War's, the shortest) plus the
 * results and intro after the previous game's; a smaller move later re-runs a
 * moment of the same game (a broadcast replay).
 */
const NEXT_GAME_MIN_ZERO_SHIFT_SECONDS = 210;

/** One read of the match timer. */
export interface ClockRead {
	t: number;
	/** displayed seconds; null = unread */
	time: number | null;
}

/** The reads following one anchor, from the first to the last. */
export interface ClockSpan {
	/** when the display reaches 0:00, on the reads' `t` axis */
	zero: number;
	from: number;
	to: number;
	/** timed reads on the span, misreads included */
	reads: number;
	/** on the game's chain of live spans; false = a moment shown again */
	live: boolean;
}

/** Where a read stands on the clock. */
export interface ClockPosition {
	/** false = the read falls on a moment shown again */
	live: boolean;
	/** the read's time, or its span's prediction when the read is off the span (a misread); null for an unread one */
	time: number | null;
	/** seconds left on the clock by the span's anchor, unrounded; null with no span */
	remaining: number | null;
}

/**
 * The clock's spans over a game's timer reads, in time order. Reads come in any
 * order; unread ones are left out. No span until the clock is seen running.
 */
export function track(reads: readonly ClockRead[]): ClockSpan[] {
	const timed = reads
		.flatMap((read) =>
			read.time === null ? [] : [{ t: read.t, time: read.time }],
		)
		.sort((a, b) => a.t - b.t);

	const spans: { zero: number; reads: { t: number; time: number }[] }[] = [];
	let pending: { t: number; time: number }[] = [];
	for (const read of timed) {
		const current = spans.at(-1);
		if (current && fits(current.zero, read)) {
			current.reads.push(...pending, read);
			pending = [];
			continue;
		}
		const confirming = pending.find(
			(other) =>
				other.time !== read.time &&
				Math.abs(projection(other) - projection(read)) <=
					ANCHOR_TOLERANCE_SECONDS,
		);
		if (!confirming) {
			pending.push(read);
			continue;
		}
		const zero = projection(read);
		const firstOn = pending.findIndex((other) => fits(zero, other));
		current?.reads.push(...pending.slice(0, firstOn));
		spans.push({ zero, reads: [...pending.slice(firstOn), read] });
		pending = [];
	}
	spans.at(-1)?.reads.push(...pending);

	const live = liveChain(spans);
	return spans.map((span, i) => ({
		zero: span.zero,
		from: span.reads[0]!.t,
		to: span.reads.at(-1)!.t,
		reads: span.reads.length,
		live: live[i]!,
	}));
}

/**
 * A read's place on the clock's spans: the span it falls in, else the one
 * before it (the first for a read before every span). A read with no spans
 * around it is live as read.
 */
export function position(
	spans: readonly ClockSpan[],
	read: ClockRead,
): ClockPosition {
	const span = spanAt(spans, read.t);
	if (!span) return { live: true, time: read.time, remaining: null };
	const remaining = span.zero - read.t;
	const misread =
		read.time !== null &&
		read.t >= span.from &&
		read.t <= span.to &&
		!fits(span.zero, { t: read.t, time: read.time });
	return {
		live: span.live,
		time: misread ? Math.max(0, Math.ceil(remaining)) : read.time,
		remaining,
	};
}

/**
 * Per span, whether it starts another game: its zero moved later than the
 * game before it by more than a replay could, and it was first read at the
 * start of its clock. The game's zero is the earliest of its spans' (a
 * broadcast replay shown after it sits later, a cut ahead earlier). Over a
 * whole scan this splits the games whose intro and results screen were both
 * missed.
 */
export function gameOpenings(spans: readonly ClockSpan[]): boolean[] {
	let gameZero: number | null = null;
	return spans.map((span) => {
		const opens =
			gameZero !== null &&
			span.zero - gameZero >= NEXT_GAME_MIN_ZERO_SHIFT_SECONDS &&
			startsAtFullClock(span);
		gameZero =
			opens || gameZero === null ? span.zero : Math.min(gameZero, span.zero);
		return opens;
	});
}

function startsAtFullClock(span: ClockSpan): boolean {
	const remaining = span.zero - span.from;
	return CLOCK_LENGTHS_SECONDS.some(
		(length) =>
			remaining >= length - GAME_START_MAX_ELAPSED_SECONDS &&
			remaining <= length + GAME_START_MAX_HOLD_SECONDS,
	);
}

function spanAt(spans: readonly ClockSpan[], t: number): ClockSpan | null {
	let found: ClockSpan | null = spans[0] ?? null;
	for (const span of spans) {
		if (span.from > t) break;
		found = span;
	}
	return found;
}

function projection(read: { t: number; time: number }): number {
	return read.t + read.time;
}

/** The display the anchor predicts, or held at the clock's length before the start or at 0:01 in overtime. */
function fits(zero: number, read: { t: number; time: number }): boolean {
	const remaining = zero - read.t;
	if (Math.abs(remaining - read.time) <= ANCHOR_TOLERANCE_SECONDS) return true;
	if (
		CLOCK_LENGTHS_SECONDS.includes(read.time) &&
		remaining >= read.time - ANCHOR_TOLERANCE_SECONDS
	) {
		return true;
	}
	return (
		read.time <= OVERTIME_DISPLAY_MAX_SECONDS &&
		remaining <= read.time + ANCHOR_TOLERANCE_SECONDS
	);
}

/** Per span, whether it is on the heaviest chain of non-increasing zeros (weighed in reads; the earliest chain on a tie). */
function liveChain(
	spans: readonly { zero: number; reads: readonly unknown[] }[],
): boolean[] {
	const weights: number[] = [];
	const previous: number[] = [];
	let best = -1;
	for (const [i, span] of spans.entries()) {
		let before = -1;
		for (let j = 0; j < i; j++) {
			if (
				span.zero <= spans[j]!.zero + ANCHOR_TOLERANCE_SECONDS &&
				(before === -1 || weights[j]! > weights[before]!)
			) {
				before = j;
			}
		}
		weights.push(span.reads.length + (before === -1 ? 0 : weights[before]!));
		previous.push(before);
		if (best === -1 || weights[i]! > weights[best]!) best = i;
	}
	const live = spans.map(() => false);
	for (let i = best; i !== -1; i = previous[i]!) live[i] = true;
	return live;
}
