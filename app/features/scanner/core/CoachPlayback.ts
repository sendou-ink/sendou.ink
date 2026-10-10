/**
 * Coach mode's playback steps: jumping back and forth between the games, lives
 * or events of a file from where the video is, or a few seconds, and the
 * speeds it plays at.
 * Stepping back restarts the one playing, as a music player's previous track
 * does, unless it began moments ago.
 */

export const SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const;

/** how far the seconds step moves the video */
export const SECONDS_STEP_S = 5;

/** stepping back this far into a game, life or event restarts it rather than going to the one before */
const RESTART_GRACE_S = 3;
/** a start this close ahead of the video is where it already is */
const SAME_SPOT_S = 0.5;

export type Direction = "previous" | "next";

/**
 * Where stepping `direction` from `t` (seconds into the video) lands among
 * `items`, each starting at `startOf(item)`, in any order: forward the first
 * to start ahead, back the one playing — or the one before it, when that began
 * under `RESTART_GRACE_S` ago. Undefined when there's nowhere to go; of items
 * starting together the first listed.
 */
export function step<T>(
	items: readonly T[],
	startOf: (item: T) => number,
	t: number,
	direction: Direction,
): T | undefined {
	let best: T | undefined;
	for (const item of items) {
		const start = startOf(item);
		if (direction === "next") {
			if (
				start > t + SAME_SPOT_S &&
				(best === undefined || start < startOf(best))
			) {
				best = item;
			}
		} else if (
			start < t - RESTART_GRACE_S &&
			(best === undefined || start > startOf(best))
		) {
			best = item;
		}
	}
	return best;
}

/**
 * The speed of `SPEEDS` one step slower or faster than `current` (which may
 * be off the list, set from the player's own menu); `current` at either end.
 */
export function speedStep(current: number, direction: Direction): number {
	const speed =
		direction === "next"
			? SPEEDS.find((candidate) => candidate > current)
			: SPEEDS.findLast((candidate) => candidate < current);
	return speed ?? current;
}
