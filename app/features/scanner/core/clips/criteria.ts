/**
 * What makes a streak a clip, picked on the page instead of fixed: a minimum
 * splat count and a length cap per splat count, so a longer streak may run
 * longer. The tournament montage lists its candidates with it and a scanned
 * VoD cuts its clips with it, both re-reading the saved scan when it changes.
 */
import type { ScannerMatch } from "../scanner-match";
import { type ClipWindow, MAX_CLIP_SECONDS, scoreWindows } from "./scoring";

/** the last one also covers longer streaks */
export const CLIP_CRITERIA_KILL_COUNTS = [2, 3, 4, 5] as const;
export const CLIP_CRITERIA_MAX_SECONDS_OPTIONS = [20, 30, 45, 60, 90] as const;
/** a scanned VoD's clips before the player picks: 4 splats in a row, up to a minute */
export const DEFAULT_VOD_CLIP_CRITERIA: ClipCriteria = {
	minKills: 4,
	maxSecondsByKills: {
		2: MAX_CLIP_SECONDS,
		3: MAX_CLIP_SECONDS,
		4: MAX_CLIP_SECONDS,
		5: MAX_CLIP_SECONDS,
	},
};

export interface ClipCriteria {
	minKills: number;
	/** the clip's length cap, by splat count (`CLIP_CRITERIA_KILL_COUNTS`) */
	maxSecondsByKills: Record<number, number>;
}

/**
 * The game's windows meeting the criteria, chronological: streaks of at
 * least `minKills` splats that fit the length cap of their splat count.
 * Where a streak qualifies in several ways (5 splats in 50 s, or its first 3
 * in 25 s) the best-scoring reading wins and no splat is in two windows.
 */
export function criteriaWindows(
	game: { kills: ScannerMatch["kills"]; deaths: readonly number[] },
	criteria: ClipCriteria,
): ClipWindow[] {
	const windows = CLIP_CRITERIA_KILL_COUNTS.filter(
		(kills) => kills >= criteria.minKills,
	)
		.flatMap((kills) =>
			scoreWindows(game, game.deaths, {
				minKills: kills,
				maxSeconds: maxSecondsFor(criteria, kills),
			}),
		)
		.filter(
			(window) =>
				window.end - window.start <= maxSecondsFor(criteria, window.kills),
		)
		.sort((a, b) => b.score - a.score);

	const kept: ClipWindow[] = [];
	for (const window of windows) {
		const sharesKill = kept.some((other) =>
			other.killTimes.some((t) => window.killTimes.includes(t)),
		);
		if (!sharesKill) kept.push(window);
	}
	return kept.sort((a, b) => a.start - b.start);
}

/** The length cap for a streak of `kills` splats. */
export function maxSecondsFor(criteria: ClipCriteria, kills: number): number {
	const counted = Math.min(kills, CLIP_CRITERIA_KILL_COUNTS.at(-1)!);
	return criteria.maxSecondsByKills[counted] ?? MAX_CLIP_SECONDS;
}

/** `criteria` with the counts it lacks (an older saved version) taken from `defaults`. */
export function withDefaultCaps(
	criteria: ClipCriteria,
	defaults: ClipCriteria,
): ClipCriteria {
	return {
		minKills: criteria.minKills,
		maxSecondsByKills: {
			...defaults.maxSecondsByKills,
			...criteria.maxSecondsByKills,
		},
	};
}
