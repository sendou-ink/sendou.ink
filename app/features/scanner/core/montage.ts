/**
 * The tournament montage (dev only, `view=montage`): a folder of a
 * tournament's match VoDs downloaded by `pnpm vods:download`, described by
 * its `tournament.json` manifest, which streaks of its games are clip
 * candidates (a length cap per splat count, so a longer streak may run
 * longer), and how a picked clip plays back in the rendered video — the
 * dead time between two kills fast-forwarded, keeping `KILL_MARGIN_S` of
 * normal speed after a kill and before the next one.
 */

import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { weaponIdToBaseWeaponId } from "~/modules/in-game-lists/weapon-ids";
import { type ClipWindow, scoreWindows } from "./clips/scoring";
import type { ScannerMatch } from "./scanner-match";

export const MONTAGE_MANIFEST_FILE = "tournament.json";
/** the last one also covers longer streaks */
export const MONTAGE_KILL_COUNTS = [2, 3, 4, 5] as const;
export const MONTAGE_MAX_SECONDS_OPTIONS = [20, 30, 45, 60, 90] as const;
export const DEFAULT_MONTAGE_CRITERIA: MontageCriteria = {
	minKills: 3,
	maxSecondsByKills: { 2: 20, 3: 30, 4: 45, 5: 60 },
};
export const FAST_FORWARD_SPEED = 4;
const KILL_MARGIN_S = 3;
/** a shorter stretch of dead time isn't worth the jump in speed */
const MIN_FAST_FORWARD_S = 2;

/** Written next to the VoDs by `scripts/download-tournament-vods.ts`; image fields name files in the same folder. */
export interface MontageManifest {
	tournamentId: number;
	name: string;
	/** epoch ms */
	startsAt: number;
	logo: string | null;
	tier: number | null;
	organization: { name: string; logo: string | null } | null;
	teamsCount: number;
	playersCount: number;
	/** best first, ties share a placement; players are the ones who played */
	topTeams: Array<MontageManifestTeam & { placement: number }>;
	vods: MontageManifestVod[];
}

export interface MontageManifestTeam {
	id: number;
	name: string;
	logo: string | null;
	players: Array<{ name: string; countryCode: string | null }>;
}

export interface MontageManifestVod {
	file: string;
	matchId: number;
	/** the Twitch account the VoD is from */
	account: string;
	/** whose POV the VoD is; null for casts */
	team: { id: number; name: string } | null;
	/** e.g. "Winners Round 2" */
	roundName: string | null;
	bracketName: string | null;
	/** the match's two sides */
	teams: Array<Pick<MontageManifestTeam, "id" | "name" | "logo">>;
	/** the streamer, when they have a sendou.ink account */
	pov: { name: string; profilePath: string; avatar: string | null } | null;
}

/** What makes a streak a clip candidate. */
export interface MontageCriteria {
	minKills: number;
	/** the clip's length cap before fast-forwarding, by splat count (`MONTAGE_KILL_COUNTS`) */
	maxSecondsByKills: Record<number, number>;
}

/** A scanned game, as much of it as clip scoring needs. */
export interface MontageGame {
	kills: ScannerMatch["kills"];
	mode: ModeShort | null;
	stage: StageId | null;
	/** the POV player's death times */
	deaths: number[];
	/** read off the POV player's scoreboard row; null when no scoreboard placed them */
	povWeaponId: MainWeaponId | null;
	/** the scoreboard's two sides, told apart by the POV seat; null without one */
	lineups: {
		pov: MontageLineupPlayer[];
		opponent: MontageLineupPlayer[];
	} | null;
}

export interface MontageLineupPlayer {
	name: string | null;
	weaponId: MainWeaponId | null;
}

export interface MontageCandidate {
	/** the VoD and the clip's span in it */
	key: string;
	vod: MontageManifestVod;
	window: ClipWindow;
	mode: ModeShort | null;
	stage: StageId | null;
	/** the POV player's weapon off the game's scoreboard */
	weaponId: MainWeaponId | null;
	/** seconds the clip lasts in the montage, dead time fast-forwarded */
	duration: number;
}

export interface PlaybackSegment {
	/** seconds into the source file */
	from: number;
	/** seconds into the source file */
	to: number;
	speed: number;
}

/** The clip's playback, chronological and gapless: normal speed except fast-forwarded dead time between kills. */
export function playbackSegments(clip: {
	start: number;
	end: number;
	killTimes: readonly number[];
}): PlaybackSegment[] {
	const segments: PlaybackSegment[] = [];
	let cursor = clip.start;
	const kills = clip.killTimes.toSorted((a, b) => a - b);
	for (let i = 1; i < kills.length; i++) {
		const from = Math.max(cursor, kills[i - 1]! + KILL_MARGIN_S);
		const to = Math.min(clip.end, kills[i]! - KILL_MARGIN_S);
		if (to - from < MIN_FAST_FORWARD_S) continue;
		if (from > cursor) segments.push({ from: cursor, to: from, speed: 1 });
		segments.push({ from, to, speed: FAST_FORWARD_SPEED });
		cursor = to;
	}
	if (clip.end > cursor)
		segments.push({ from: cursor, to: clip.end, speed: 1 });
	return segments;
}

/** Seconds the segments last once played back. */
export function playbackDuration(segments: readonly PlaybackSegment[]): number {
	return segments.reduce(
		(sum, segment) => sum + (segment.to - segment.from) / segment.speed,
		0,
	);
}

/**
 * The game's clip candidates, chronological: streaks of at least `minKills`
 * splats that fit the length cap of their splat count. Where a streak
 * qualifies in several ways (5 splats in 50 s, or its first 3 in 25 s) the
 * best-scoring reading wins and no splat is in two candidates.
 */
export function montageWindows(
	game: Pick<MontageGame, "kills" | "deaths">,
	criteria: MontageCriteria,
): ClipWindow[] {
	const windows = MONTAGE_KILL_COUNTS.filter(
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
export function maxSecondsFor(
	criteria: MontageCriteria,
	kills: number,
): number {
	const counted = Math.min(kills, MONTAGE_KILL_COUNTS.at(-1)!);
	return (
		criteria.maxSecondsByKills[counted] ??
		DEFAULT_MONTAGE_CRITERIA.maxSecondsByKills[counted]!
	);
}

/**
 * The candidates grouped by the base of their weapon (Tentatek Splattershot
 * with the Splattershot), each group keeping the candidates' order; groups
 * come in the order of their first candidate, unknown weapons last.
 */
export function candidatesByBaseWeapon<
	T extends Pick<MontageCandidate, "weaponId">,
>(candidates: readonly T[]) {
	const groups = new Map<MainWeaponId | null, T[]>();
	for (const candidate of candidates) {
		const baseWeaponId =
			candidate.weaponId === null
				? null
				: weaponIdToBaseWeaponId(candidate.weaponId);
		groups.set(baseWeaponId, [...(groups.get(baseWeaponId) ?? []), candidate]);
	}
	return [...groups]
		.map(([baseWeaponId, grouped]) => ({ baseWeaponId, candidates: grouped }))
		.sort(
			(a, b) =>
				Number(a.baseWeaponId === null) - Number(b.baseWeaponId === null),
		);
}
