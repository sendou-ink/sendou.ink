/**
 * Eviction policy for the live capture's frame backlog. Dropping the oldest
 * frame truncates the buffered window to limit/fps seconds, so a parse
 * stall longer than that (a CJK splash-tag name read runs tens of seconds)
 * silently discards whole screens — including the scoreboard that closes a
 * match. Instead the backlog is decimated: evict the frame whose two
 * neighbors sit closest together in time. Repeated evictions thin the
 * buffer toward evenly spaced coverage of the whole stall, so a screen that
 * appeared mid-stall keeps a few frames rather than losing all of them
 * (measured: a 50s stall at 2fps/24 slots keeps a mid-stall 10s screen at
 * 4 frames with a 3s worst gap). The oldest and newest frames are never
 * evicted, so the covered span itself always survives.
 */

/**
 * Index of the frame to evict from a backlog of capture timestamps
 * (ascending). Timestamps only — the caller owns the frames themselves.
 */
export function frameEvictionIndex(times: readonly number[]): number {
	if (times.length < 3) return 0;
	let best = 1;
	let bestGap = Number.POSITIVE_INFINITY;
	for (let i = 1; i < times.length - 1; i++) {
		const gap = times[i + 1]! - times[i - 1]!;
		if (gap < bestGap) {
			bestGap = gap;
			best = i;
		}
	}
	return best;
}
