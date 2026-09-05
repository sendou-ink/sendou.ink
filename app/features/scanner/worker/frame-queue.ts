/**
 * Eviction policy for the live capture's frame backlog. Dropping the oldest
 * frame truncates the window to limit/fps seconds, so a longer parse stall (a
 * CJK splash-tag read runs tens of seconds) silently discards whole screens,
 * the match-closing scoreboard included. Instead the backlog is decimated:
 * evict the frame whose two neighbors sit closest in time, thinning toward
 * even coverage of the whole stall (measured: a 50s stall at 2fps/24 slots
 * keeps a mid-stall 10s screen at 4 frames, 3s worst gap). The oldest and
 * newest frames are never evicted, so the covered span survives.
 */

/** Index of the frame to evict from an ascending backlog of capture timestamps. */
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
