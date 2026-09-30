const PENALTY_BRIDGE_SECONDS = 6;

/** Label gutter left of the plot, shared by the objective chart's y-axis and the player-status weapon column so both span the same x-range. */
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
 * The penalty pill flickers between a value and null and occasionally drops a digit ("36" → "6").
 * Median-filters outliers, drops one-off reads with no nearby confirmation and carries the previous
 * value across short null gaps so the band renders as one steady shape.
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

/** Seconds formatted as m:ss, with an hours part only when needed. */
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
