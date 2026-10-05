import * as R from "remeda";
import type { ObjectiveTimelineEvent } from "./ObjectiveTimeline";

const PENALTY_BRIDGE_SECONDS = 6;
const MAX_TIME_TICKS = 8;
const PX_PER_TIME_TICK = 56;
const TIME_TICK_STEPS_SECONDS = [
	1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600,
];

/** Label gutter left of the plot, shared by the objective chart's y-axis and the player-status weapon column so both span the same x-range. */
export const TIMELINE_PLOT_GUTTER_PX = 36;

/** The count a knockout wins at: the counter runs out and the team takes all of it. */
const FULL_COUNT = 100;

/** Every counter mode's clock starts at 5:00. */
const GAME_CLOCK_SECONDS = 300;

/**
 * A game start projected further before the earliest read than this means the
 * footage began mid-game; a cast's map screen can hide the whole HUD for the
 * game's first ~10s.
 */
const GAME_START_MAX_LEAD_SECONDS = 15;

/** One penalty read: when it was made and the pill value seen (null = no pill or unreadable). */
export interface PenaltyRead {
	/** whole seconds into the source (video, stream or game) the read was made at */
	t: number;
	penalty: number | null;
}

/**
 * The penalty pill flickers between a value and null and occasionally drops a digit ("36" → "6").
 * Median-filters outliers, drops one-off reads with no nearby confirmation and carries the previous
 * value across short null gaps so the band renders as one steady shape. A value repeated by the
 * neighboring pill read confirms itself at any distance, and a null gap between two equal values is
 * bridged whatever its length: a pill only goes away worked off, so it can't come back unchanged
 * (Clam Blitz holds one steady for minutes while reads re-confirm only every ~10s).
 *
 * @param reads one team's reads sorted by `t` ascending; result is index-aligned
 */
export function smoothPenalties(
	reads: readonly PenaltyRead[],
): (number | null)[] {
	const medianFiltered = medianFilterValues(reads.map((read) => read.penalty));
	const kept = reads.map((read, i) => {
		const value = medianFiltered[i]!;
		if (value === null) return null;
		const hasNearbyRead = reads.some(
			(other, j) =>
				j !== i &&
				other.penalty !== null &&
				Math.abs(other.t - read.t) <= PENALTY_BRIDGE_SECONDS,
		);
		return hasNearbyRead || repeatsNeighboringRead(reads, i) ? value : null;
	});

	const result = [...kept];
	let prev = -1;
	for (let i = 0; i < result.length; i++) {
		if (result[i] !== null) {
			prev = i;
			continue;
		}
		if (prev === -1) continue;
		const next = result.findIndex((value, j) => j > i && value !== null);
		if (next === -1) continue;
		if (
			reads[next]!.t - reads[prev]!.t <= PENALTY_BRIDGE_SECONDS ||
			result[next] === result[prev]
		) {
			result[i] = result[prev];
		}
	}
	return result;
}

/** One counter read: when it was made and the count displayed per team. */
export interface ObjectiveScoreRead {
	/** whole seconds into the source (video, stream or game) the read was made at */
	t: number;
	/** displayed count per team; null = unreadable */
	score: readonly [number | null, number | null];
}

/**
 * Match scores (0-100, null if nothing read) implied by each team's last readable counter read,
 * inverted since the counter counts down. Stands in where the results screen has no score (a
 * knockout's loser), but can trail the final count since it only goes as far as the counter was last seen.
 *
 * @param reads in any order
 */
export function matchScoresFromObjective(
	reads: readonly ObjectiveScoreRead[],
): [number | null, number | null] {
	const sorted = reads.toSorted((a, b) => a.t - b.t);
	const lastCountTaken = (side: 0 | 1) => {
		for (let i = sorted.length - 1; i >= 0; i--) {
			const count = sorted[i]!.score[side];
			// a count outside the counter's range is a misread, not a state
			if (count !== null && count >= 0 && count <= FULL_COUNT) {
				return FULL_COUNT - count;
			}
		}
		return null;
	};

	return [lastCountTaken(0), lastCountTaken(1)];
}

interface TrackCountEvent {
	data: {
		score: [number | null, number | null];
		position?: number | null;
	};
}

/**
 * TC/RM draw no count plate for a team that never pushed past the middle, so
 * a side's reads before its first count showed its full count, not an
 * unreadable one. SZ events (no `position`) pass through untouched.
 *
 * @param sorted events sorted by `t` ascending; result is index-aligned
 */
export function withUnpushedTrackCounts<T extends TrackCountEvent>(
	sorted: readonly T[],
): T[] {
	if (!sorted.some((event) => event.data.position !== undefined)) {
		return [...sorted];
	}
	const firstRead = ([0, 1] as const).map((side) =>
		sorted.findIndex((event) => event.data.score[side] !== null),
	);
	return sorted.map((event, i) => {
		const score = event.data.score.map((value, side) => {
			const first = firstRead[side]!;
			return value === null && (first === -1 || i < first) ? FULL_COUNT : value;
		}) as [number | null, number | null];
		return { ...event, data: { ...event.data, score } };
	});
}

/**
 * Both counts are full when the clock starts, so footage covering the game
 * start (the clock projects it no further than GAME_START_MAX_LEAD_SECONDS
 * before the earliest read) gets a full-count point there, and a side's reads
 * before its first readable count read full. Later unread counts stay unread:
 * a count only falls, so filling one mid-game would draw a jump up.
 *
 * @param sorted events sorted by `t` ascending
 * @param earliestT when the earliest timeline read of any kind was made (the
 * icon strip can be read while a map screen hides the counter)
 */
export function withFullCountsAtGameStart(
	sorted: readonly ObjectiveTimelineEvent[],
	earliestT: number,
): ObjectiveTimelineEvent[] {
	const clockRead = sorted.find((event) => event.data.time !== null);
	if (!clockRead) return [...sorted];
	const gameStartT = clockRead.t - (GAME_CLOCK_SECONDS - clockRead.data.time!);
	if (gameStartT < earliestT - GAME_START_MAX_LEAD_SECONDS) return [...sorted];

	const firstRead = ([0, 1] as const).map((side) =>
		sorted.findIndex((event) => event.data.score[side] !== null),
	);
	const filled = sorted.map((event, i) => {
		const score = event.data.score.map((value, side) =>
			value === null && (firstRead[side] === -1 || i < firstRead[side]!)
				? FULL_COUNT
				: value,
		) as [number | null, number | null];
		return { ...event, data: { ...event.data, score } };
	});
	if (sorted[0]!.t <= gameStartT) return filled;

	const start: ObjectiveTimelineEvent = {
		t: gameStartT,
		data: {
			time: GAME_CLOCK_SECONDS,
			score: [FULL_COUNT, FULL_COUNT],
			penalty: [null, null],
			control: null,
			...(sorted[0]!.data.position !== undefined ? { position: 0 } : null),
		},
	};
	return [start, ...filled];
}

/**
 * Round-numbered time-axis ticks between `min` and `max` (seconds), spaced to fit `plotWidth`.
 * Shared so stacked timelines draw their gridlines at the same times.
 */
export function timelineTimeTicks({
	min,
	max,
	plotWidth,
}: {
	min: number;
	max: number;
	plotWidth: number;
}) {
	const maxCount = R.clamp(Math.floor(plotWidth / PX_PER_TIME_TICK), {
		min: 2,
		max: MAX_TIME_TICKS,
	});
	const range = Math.max(max - min, 1);
	const step =
		TIME_TICK_STEPS_SECONDS.find(
			(candidate) => range / candidate <= maxCount - 1,
		) ?? Math.ceil(range / (maxCount - 1) / 3600) * 3600;

	return R.range(Math.ceil(min / step), Math.floor(max / step) + 1).map(
		(multiple) => multiple * step,
	);
}

/** Seconds formatted as m:ss, with an hours part only when needed. */
export function formatElapsed(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const rest = String(Math.floor(seconds % 60)).padStart(2, "0");
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
		: `${minutes}:${rest}`;
}

/** The closest pill read before or after `index` shows the same value. */
function repeatsNeighboringRead(reads: readonly PenaltyRead[], index: number) {
	const value = reads[index]!.penalty;
	const previous = reads.findLast(
		(read, j) => j < index && read.penalty !== null,
	);
	const next = reads.find((read, j) => j > index && read.penalty !== null);
	return previous?.penalty === value || next?.penalty === value;
}

function medianFilterValues(
	values: readonly (number | null)[],
): (number | null)[] {
	const nonNullIndexes = values.flatMap((value, i) =>
		value !== null ? [i] : [],
	);
	const result = [...values];
	for (let k = 1; k < nonNullIndexes.length - 1; k++) {
		const window = [
			values[nonNullIndexes[k - 1]!]!,
			values[nonNullIndexes[k]!]!,
			values[nonNullIndexes[k + 1]!]!,
		].sort((a, b) => a - b);
		result[nonNullIndexes[k]!] = window[1]!;
	}
	return result;
}
