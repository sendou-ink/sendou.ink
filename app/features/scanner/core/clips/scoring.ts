/**
 * Clip scoring v1, built to be swapped for richer signals later (overtime, a
 * knockout-closing kill, death chains as "review" clips). Only the POV
 * player's own kills feed it: a streak is a run of consecutive kills with no
 * POV death between them and no pause longer than `STREAK_MAX_GAP_S`, cut
 * where its clip would outgrow `MAX_CLIP_SECONDS` so every clip fits and its
 * kill count stays honest. On a cast the kill feed follows the camera, so a
 * camera switch between two kills ends the streak too (the kills are another
 * player's), and the specced player's splat counts as the POV death. A streak
 * of `minKills` or more is a window, scored by streak length first and
 * density second.
 */
import { DEATH_EVENT_TYPE } from "../detectors/death/index";
import { MINIMAP_EVENT_TYPE } from "../detectors/minimap/index";
import type { DetectedEvent } from "../events";
import {
	killerSeat,
	type ScannerMatch,
	type ScannerMatchKill,
	type ScannerMatchSeat,
} from "../scanner-match";

export const MAX_CLIP_SECONDS = 60;
/** footage kept before the first kill: the approach */
const CLIP_LEAD_S = 5;
/** footage kept after the last kill: the splat's follow-through */
const CLIP_TAIL_S = 3;
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
	/** seconds into the stream/file of each kill, chronological */
	killTimes: number[];
	score: number;
	/** whose streak it is: the POV player, or on a cast the specced one; null when unknown */
	player: ScannerMatchSeat | null;
}

/** A kill as streak scoring sees it: whose it is, when known (`killerSeat`). */
interface StreakKill extends ScannerMatchKill {
	player?: ScannerMatchSeat | null;
}

/** Where the spectator camera was at a status read (cast matches only). */
interface CameraRead {
	t: number;
	seat: ScannerMatchSeat;
}

/** A game as streak scoring reads it (`streakGame`). */
export interface StreakGame {
	kills: StreakKill[] | null;
	/** the POV (on a cast: specced) player's death times */
	deaths: number[];
	/** cast only: the camera over the game; a switch between two kills ends the streak */
	camera?: CameraRead[];
}

/**
 * The match's clip-worthy windows, chronological. `deaths` are the POV
 * player's death times (seconds into the stream/file); a death between two
 * kills ends the streak, as does a pause over `maxGapSeconds`. Kill times are
 * whole seconds, so a death on the same second as a kill (a trade) counts
 * after that kill.
 */
export function scoreWindows(
	game: Pick<StreakGame, "kills" | "camera">,
	deaths: readonly number[],
	{
		minKills,
		maxSeconds = MAX_CLIP_SECONDS,
		maxGapSeconds = STREAK_MAX_GAP_S,
	}: { minKills: number; maxSeconds?: number; maxGapSeconds?: number },
): ClipWindow[] {
	const sortedDeaths = deaths.toSorted((a, b) => a - b);
	const windows: ClipWindow[] = [];
	let run: StreakKill[] = [];
	const flush = () => {
		if (run.length >= minKills) windows.push(scoreRun(run));
		run = [];
	};
	for (const kill of (game.kills ?? []).toSorted((a, b) => a.t - b.t)) {
		const last = run.at(-1);
		if (
			last &&
			(kill.t - last.t > maxGapSeconds ||
				diedBetween(sortedDeaths, last.t, kill.t) ||
				!samePlayer(
					run.findLast((other) => other.player)?.player,
					kill.player,
				) ||
				cameraSwitched(game.camera ?? [], last.t, kill.t) ||
				clipEnd(kill) - clipStart(run[0]!) > maxSeconds)
		) {
			flush();
		}
		run.push(kill);
	}
	flush();
	return windows;
}

/**
 * A built match as `scoreWindows` reads it: its kills with whose they are,
 * its POV deaths and, on a cast, the camera's seat at every status read plus
 * the specced player's splats (the strip's dead flag of the seat the camera
 * is on) as deaths.
 */
export function streakGame({
	match,
	sources,
}: {
	match: ScannerMatch;
	sources: readonly DetectedEvent[];
}): StreakGame {
	const camera = (match.playerStatus?.samples ?? []).flatMap((sample) =>
		sample.spectated ? [{ t: sample.t, seat: sample.spectated }] : [],
	);
	const castDeaths = (match.playerStatus?.samples ?? []).flatMap((sample) =>
		sample.spectated &&
		sample.dead[sample.spectated.team][sample.spectated.index]
			? [sample.t]
			: [],
	);
	return {
		kills: (match.kills ?? []).map((kill) => ({
			...kill,
			player: killerSeat(match, kill),
		})),
		deaths: [...povDeathTimes(sources), ...castDeaths],
		...(match.cast ? { camera } : null),
	};
}

/**
 * The POV player's death times among a match's events, for `scoreWindows`:
 * each respawn overlay, plus each minimap read with the POV player's own card
 * struck out — opening the map right after a splat hides the overlay.
 */
export function povDeathTimes(events: readonly DetectedEvent[]): number[] {
	return events
		.filter(
			(event) =>
				event.type === DEATH_EVENT_TYPE ||
				(event.type === MINIMAP_EVENT_TYPE &&
					event.data.teammates.some(
						(teammate) => teammate.self && teammate.dead,
					)),
		)
		.map((event) => event.t);
}

/** `kills² + kills / span`: the streak decides, density breaks ties. */
function scoreRun(kills: readonly StreakKill[]): ClipWindow {
	const first = kills[0]!;
	const last = kills.at(-1)!;
	const span = Math.max(1, last.t - first.t);
	return {
		start: clipStart(first),
		end: clipEnd(last),
		t: last.t,
		time: last.time,
		kills: kills.length,
		killTimes: kills.map((kill) => kill.t),
		score: kills.length ** 2 + kills.length / span,
		player: kills.find((kill) => kill.player)?.player ?? null,
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

/** Unknown players match anyone. */
function samePlayer(
	a: ScannerMatchSeat | null | undefined,
	b: ScannerMatchSeat | null | undefined,
): boolean {
	return !a || !b || (a.team === b.team && a.index === b.index);
}

function cameraSwitched(
	camera: readonly CameraRead[],
	from: number,
	until: number,
): boolean {
	let seat: ScannerMatchSeat | null = null;
	for (const read of camera) {
		if (read.t < from || read.t > until) continue;
		if (seat && !samePlayer(seat, read.seat)) return true;
		seat = read.seat;
	}
	return false;
}
