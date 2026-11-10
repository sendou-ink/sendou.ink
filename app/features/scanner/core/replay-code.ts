/**
 * Reads of one replay code differ in a few glyphs (U/V, G/C on low-fidelity
 * captures); different replays share almost no positions. A check that only
 * splits reads apart can tolerate more jitter than one that also proves two
 * reads are the same replay, hence two bounds.
 */
const SAME_REPLAY_MAX_DIFF = 3;
const DIFFERENT_REPLAY_MIN_DIFF = 7;

/** Whether two replay code reads are close enough to prove they are the same replay. */
export function isSameReplayCode(a: string, b: string): boolean {
	return replayCodeDiff(a, b) <= SAME_REPLAY_MAX_DIFF;
}

/** Whether two replay code reads are too far apart to be OCR jitter of one code. */
export function areDifferentReplayCodes(a: string, b: string): boolean {
	return replayCodeDiff(a, b) >= DIFFERENT_REPLAY_MIN_DIFF;
}

/** Positions at which two codes differ, a length mismatch counts every extra position. */
function replayCodeDiff(a: string, b: string): number {
	const shorter = Math.min(a.length, b.length);
	let diff = Math.max(a.length, b.length) - shorter;
	for (let i = 0; i < shorter; i++) {
		if (a[i] !== b[i]) diff++;
	}
	return diff;
}
