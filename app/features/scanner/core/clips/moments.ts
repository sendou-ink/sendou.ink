/**
 * Clip moments of a cast, what a followed broadcast's replays scene picks from
 * instead of the POV streaks (scoring.ts).
 *
 * - double/triple splat: one player's 2 kills at most `DOUBLE_MAX_GAP_S`
 *   apart, 3 at most `TRIPLE_MAX_GAP_S` apart
 * - streak: one player's 4 or more by the streak rule (`STREAK_MAX_GAP_S`
 *   between kills, no camera switch or death between)
 * - sequence: `SEQUENCE_MIN_KILLS` or more kills at most `STREAK_MAX_GAP_S`
 *   apart whoever got them: the kill feed follows the camera, so an observer
 *   cutting to each player as they splat someone still makes one long clip
 * - lead taken: the counter's leader changes, confirmed by the next read; the
 *   game's first lead (out of a tie) is not one
 * - big push (TC/RM/CB, where the count falls in bursts): a team's count
 *   falls by `PUSH_MIN_POINTS` or more without stopping for over
 *   `PUSH_MAX_PAUSE_S`, e.g. a tower ride through a checkpoint
 *
 * Moments whose clips overlap are cut as one, up to `MAX_CLIP_SECONDS`.
 */
import type {
	ScannerMatchObjective,
	ScannerMatchObjectiveSample,
} from "../scanner-match";
import {
	type ClipWindow,
	MAX_CLIP_SECONDS,
	STREAK_MAX_GAP_S,
	type StreakGame,
	scoreWindows,
} from "./scoring";

/** `splats` is a kill window, named by its kill count (double, triple, n splats) */
export const CLIP_MOMENTS = ["splats", "lead", "push"] as const;

const DOUBLE_MAX_GAP_S = 2;
const TRIPLE_MAX_GAP_S = 5;
const STREAK_MIN_KILLS = 4;
const SEQUENCE_MIN_KILLS = 4;
/** footage kept before a lead change: the fight or hold that turned it */
const LEAD_LEAD_IN_S = 12;
const LEAD_TAIL_S = 4;
/** between a triple and a streak */
const LEAD_SCORE = 10;
const PUSH_MIN_POINTS = 20;
/** a longer stop between drops (a stall at a checkpoint, a lost objective) ends the push */
const PUSH_MAX_PAUSE_S = 5;
/** a drop after a longer unread stretch happened somewhere in it, not as one burst */
const PUSH_MAX_READ_GAP_S = 11;
const PUSH_LEAD_IN_S = 5;
const PUSH_TAIL_S = 3;

export type ClipMoment = (typeof CLIP_MOMENTS)[number];

export interface MomentWindow extends ClipWindow {
	/** what the clip shows, best first */
	moments: ClipMoment[];
}

/**
 * The cast game's clip windows, chronological, see the module comment. `game`
 * is the match as streak scoring reads it (`streakGame`).
 */
export function castMomentWindows(
	game: StreakGame,
	objective: ScannerMatchObjective | null,
): MomentWindow[] {
	return mergeOverlapping([
		...killWindows(game),
		...leadWindows(objective),
		...pushWindows(objective),
	]);
}

function killWindows(game: StreakGame): MomentWindow[] {
	const anyoneKills = {
		kills: (game.kills ?? []).map(({ t, time, name }) => ({ t, time, name })),
	};
	const candidates = [
		...scoreWindows(game, game.deaths, {
			minKills: 2,
			maxGapSeconds: DOUBLE_MAX_GAP_S,
		}),
		...scoreWindows(game, game.deaths, {
			minKills: 3,
			maxGapSeconds: TRIPLE_MAX_GAP_S,
		}),
		...scoreWindows(game, game.deaths, {
			minKills: STREAK_MIN_KILLS,
			maxGapSeconds: STREAK_MAX_GAP_S,
		}),
		...scoreWindows(anyoneKills, [], {
			minKills: SEQUENCE_MIN_KILLS,
			maxGapSeconds: STREAK_MAX_GAP_S,
		}),
	].sort((a, b) => b.score - a.score);

	const kept: MomentWindow[] = [];
	for (const window of candidates) {
		const sharesKill = kept.some((other) =>
			other.killTimes.some((t) => window.killTimes.includes(t)),
		);
		if (!sharesKill) kept.push({ ...window, moments: ["splats"] });
	}
	return kept;
}

function leadWindows(objective: ScannerMatchObjective | null): MomentWindow[] {
	const windows: MomentWindow[] = [];
	let leader = null as 0 | 1 | null;
	let challenger = null as {
		team: 0 | 1;
		at: ScannerMatchObjectiveSample;
	} | null;

	for (const sample of objective?.samples ?? []) {
		const reading = leaderOf(sample);
		if (reading === null) continue;
		if (reading === leader) {
			challenger = null;
			continue;
		}
		if (challenger?.team !== reading) {
			challenger = { team: reading, at: sample };
			continue;
		}

		if (leader !== null) {
			const { t, time } = challenger.at;
			windows.push({
				start: Math.max(0, t - LEAD_LEAD_IN_S),
				end: t + LEAD_TAIL_S,
				t,
				time,
				kills: 0,
				killTimes: [],
				player: null,
				score: LEAD_SCORE,
				moments: ["lead"],
			});
		}
		leader = reading;
		challenger = null;
	}

	return windows;
}

/** The team with the lower count, `null` on a tie or an unread count. */
function leaderOf(sample: ScannerMatchObjectiveSample): 0 | 1 | null {
	const [first, second] = sample.score;
	if (first === null || second === null || first === second) return null;

	return first < second ? 0 : 1;
}

function pushWindows(objective: ScannerMatchObjective | null): MomentWindow[] {
	if (!objective || objective.mode === null || objective.mode === "SZ") {
		return [];
	}

	return ([0, 1] as const).flatMap((team) =>
		teamPushes(objective.samples, team),
	);
}

function teamPushes(
	samples: readonly ScannerMatchObjectiveSample[],
	team: 0 | 1,
): MomentWindow[] {
	const reads = withoutBlips(
		samples.flatMap((sample) => {
			const score = sample.score[team];
			return score === null ? [] : [{ t: sample.t, time: sample.time, score }];
		}),
	);
	const windows: MomentWindow[] = [];
	let push: {
		startT: number;
		from: number;
		endT: number;
		to: number;
		time: number | null;
	} | null = null;
	const flush = () => {
		if (push && push.from - push.to >= PUSH_MIN_POINTS) {
			windows.push({
				start: Math.max(0, push.startT - PUSH_LEAD_IN_S),
				end: push.endT + PUSH_TAIL_S,
				t: push.endT,
				time: push.time,
				kills: 0,
				killTimes: [],
				player: null,
				score: pushScore(push.from - push.to),
				moments: ["push"],
			});
		}
		push = null;
	};

	for (const [idx, read] of reads.entries()) {
		const previous = reads[idx - 1];
		if (!previous || read.score >= previous.score) continue;
		if (read.t - previous.t > PUSH_MAX_READ_GAP_S) {
			flush();
			continue;
		}

		if (push && read.t - push.endT <= PUSH_MAX_PAUSE_S) {
			push.endT = read.t;
			push.to = read.score;
			push.time = read.time;
		} else {
			flush();
			push = {
				startT: read.t,
				from: previous.score,
				endT: read.t,
				to: read.score,
				time: read.time,
			};
		}
	}
	flush();

	return windows;
}

/** Each count as the median of it and its neighbours, so one misread neither starts nor ends a push. */
function withoutBlips<T extends { score: number }>(reads: readonly T[]): T[] {
	return reads.map((read, idx) => {
		const before = reads[idx - 1];
		const after = reads[idx + 1];
		if (!before || !after) return read;

		const [, median] = [before.score, read.score, after.score].sort(
			(a, b) => a - b,
		);
		return { ...read, score: median! };
	});
}

/** A 20 point push ranks with a lead change, a knockout push from 100 near a streak. */
function pushScore(points: number) {
	return LEAD_SCORE + (points - PUSH_MIN_POINTS) / 10;
}

/** Windows whose footage overlaps become one clip while it fits `MAX_CLIP_SECONDS`, its scores summed. */
function mergeOverlapping(windows: readonly MomentWindow[]): MomentWindow[] {
	const merged: MomentWindow[] = [];
	for (const window of windows.toSorted((a, b) => a.start - b.start)) {
		const last = merged.at(-1);
		const end = Math.max(last?.end ?? 0, window.end);
		if (
			!last ||
			window.start > last.end ||
			end - last.start > MAX_CLIP_SECONDS
		) {
			merged.push(window);
			continue;
		}

		const latest = window.t >= last.t ? window : last;
		merged[merged.length - 1] = {
			start: last.start,
			end,
			t: latest.t,
			time: latest.time,
			kills: last.kills + window.kills,
			killTimes: [...last.killTimes, ...window.killTimes].sort((a, b) => a - b),
			score: last.score + window.score,
			player: samePlayerOrNull(last.player, window.player),
			moments: mergedMoments(last, window),
		};
	}

	return merged;
}

function samePlayerOrNull(a: ClipWindow["player"], b: ClipWindow["player"]) {
	if (!a) return b;
	if (!b) return a;

	return a.team === b.team && a.index === b.index ? a : null;
}

function mergedMoments(a: MomentWindow, b: MomentWindow): ClipMoment[] {
	const [better, worse] = a.score >= b.score ? [a, b] : [b, a];

	return Array.from(new Set([...better.moments, ...worse.moments]));
}
