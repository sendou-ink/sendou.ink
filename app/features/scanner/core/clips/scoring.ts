/**
 * Clip scoring v1, built to be swapped for richer signals later (overtime, a
 * knockout-closing kill, death chains as "review" clips). Only the POV
 * player's own kills feed it: a streak is a run of consecutive kills with no
 * POV death between them and no pause longer than `STREAK_MAX_GAP_S`, cut
 * where its clip would outgrow `MAX_CLIP_SECONDS` so every clip fits and its
 * kill count stays honest. A streak of `MIN_KILLS` or more is a window,
 * scored by streak length first and density second.
 */
import type { ScannerMatch, ScannerMatchKill } from "../scanner-match";

/** the default; the settings popover lets the player pick 3, 4 or 5 */
const MIN_KILLS = 4;
export const MAX_CLIP_SECONDS = 60;
/** footage kept before the first kill: the approach */
const CLIP_LEAD_S = 5;
/** footage kept after the last kill: the splat's follow-through */
const CLIP_TAIL_S = 4;
/** a longer pause between kills is separate fights, not one streak */
export const STREAK_MAX_GAP_S = 15;

export interface ClipWindow {
	/** seconds into the stream/file the clip starts at */
	start: number;
	/** seconds into the stream/file the clip ends at */
	end: number;
	/** seconds into the stream/file of the window's last kill — the clip's anchor */
	t: number;
	/** that kill's match timer reading, when read */
	time: number | null;
	kills: number;
	score: number;
}

/**
 * The match's clip-worthy windows, chronological. `deaths` are the POV
 * player's death times (seconds into the stream/file); a death between two
 * kills ends the streak. Kill times are whole seconds, so a death on the same
 * second as a kill (a trade) counts after that kill.
 */
export function scoreWindows(
	match: Pick<ScannerMatch, "kills">,
	deaths: readonly number[],
	{ minKills = MIN_KILLS, maxSeconds = MAX_CLIP_SECONDS } = {},
): ClipWindow[] {
	const sortedDeaths = deaths.toSorted((a, b) => a - b);
	const windows: ClipWindow[] = [];
	let run: ScannerMatchKill[] = [];
	const flush = () => {
		if (run.length >= minKills) windows.push(scoreRun(run));
		run = [];
	};
	for (const kill of (match.kills ?? []).toSorted((a, b) => a.t - b.t)) {
		const last = run.at(-1);
		if (
			last &&
			(kill.t - last.t > STREAK_MAX_GAP_S ||
				diedBetween(sortedDeaths, last.t, kill.t) ||
				clipEnd(kill) - clipStart(run[0]!) > maxSeconds)
		) {
			flush();
		}
		run.push(kill);
	}
	flush();
	return windows;
}

/** `kills² + kills / span`: the streak decides, density breaks ties. */
function scoreRun(kills: readonly ScannerMatchKill[]): ClipWindow {
	const first = kills[0]!;
	const last = kills.at(-1)!;
	const span = Math.max(1, last.t - first.t);
	return {
		start: clipStart(first),
		end: clipEnd(last),
		t: last.t,
		time: last.time,
		kills: kills.length,
		score: kills.length ** 2 + kills.length / span,
	};
}

/** Whether a clip covering [start, end] shows the moment `at`. */
export function clipCovers(
	clip: { start: number; end: number },
	at: number,
): boolean {
	return at >= clip.start && at <= clip.end;
}

/**
 * Whether a live window can no longer grow: no kill can join once the gap
 * has passed, and by then the tail is in the ring buffer too.
 */
export function windowClosed(window: ClipWindow, nowT: number): boolean {
	return nowT - window.t >= STREAK_MAX_GAP_S;
}

function clipStart(first: ScannerMatchKill): number {
	return Math.max(0, first.t - CLIP_LEAD_S);
}

function clipEnd(last: ScannerMatchKill): number {
	return last.t + CLIP_TAIL_S;
}

function diedBetween(
	sortedDeaths: readonly number[],
	from: number,
	until: number,
): boolean {
	return sortedDeaths.some((t) => t >= from && t < until);
}
