const PENALTY_BRIDGE_SECONDS = 6;

/**
 * Width of the label gutter left of the plot area, shared by the objective
 * chart (its y-axis is forced to this width) and the player-status rows (their
 * weapon-icon column), so both plots span exactly the same x-range.
 */
export const TIMELINE_PLOT_GUTTER_PX = 36;

/** The count a knockout wins at: the counter runs out and the team takes all of it. */
const FULL_COUNT = 100;

/** One penalty read: when it was made and the pill value seen (null = no pill or unreadable). */
export interface PenaltyRead {
	/** whole seconds into the source (video, stream or game) the read was made at */
	t: number;
	penalty: number | null;
}

/**
 * The penalty pill is misread for a frame or two at a time: it flickers
 * between a value and null, and occasionally drops a digit ("36" read as
 * "6"). Median-filters isolated outlier values, drops one-off reads with no
 * nearby confirmation and carries the previous value across short null gaps
 * so the band renders as one steady shape instead of a picket fence.
 *
 * @param reads one team's penalty reads, sorted by `t` ascending
 * @returns the smoothed penalty per read, index-aligned with the input
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
		return hasNearbyRead ? value : null;
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
		if (reads[next]!.t - reads[prev]!.t <= PENALTY_BRIDGE_SECONDS) {
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
 * Match scores implied by each team's last readable counter read. The counter
 * counts down from 100 while match scores run the other way (100 = knockout),
 * so a read is inverted into the count the team took. Stands in where the
 * results screen reports no score of its own — a knockout's loser — but the
 * last read is only as late as the last frame the counter was seen in, so it
 * can trail the count the team ended on.
 *
 * @param reads counter reads, in any order
 * @returns per-team match score (0-100); null where nothing was read
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

/**
 * Seconds into the source formatted for display: m:ss, growing an hours
 * part only when needed.
 */
export function formatElapsed(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const rest = String(Math.floor(seconds % 60)).padStart(2, "0");
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
		: `${minutes}:${rest}`;
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
