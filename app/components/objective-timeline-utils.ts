const PENALTY_BRIDGE_SECONDS = 6;

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
