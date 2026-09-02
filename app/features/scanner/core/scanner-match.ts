/**
 * ScannerMatch — one detected game with everything the scan could read, built
 * by core/match-builder.ts and validated at the boundaries by
 * scannerMatchSchema (../scanner-schemas.ts). Every field is nullable: a match
 * may be partial (features/scanner-ingest merges partials).
 */
import type {
	AbilityWithUnknown,
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { ScannerLobby } from "../scanner-types";

export interface ScannerMatchPlayer {
	/** in-game name; null when unread (e.g. minimap POV enemy rows show none) */
	name: string | null;
	/** sendou main-weapon id; null when no frame read the slot */
	weaponId: MainWeaponId | null;
	paint: number | null;
	ka: number | null;
	d: number | null;
	s: number | null;
	/** [head, clothes, shoes] ability rows: death screens read whole rows, minimap cards mains only */
	abilities?: AbilityWithUnknown[][];
}

export interface ScannerMatchTeam {
	/** up to 4 players; slots the scan never saw are absent */
	players: ScannerMatchPlayer[];
}

export interface ScannerMatchObjectiveSample {
	/** whole seconds into the video/stream the counter was read at */
	t: number;
	/**
	 * seconds shown on the match timer ("3:35" = 215); null = unreadable. The
	 * game clock is the axis to graph progress on — score moves at most 1/s
	 */
	time: number | null;
	/** displayed count per team, in `teams` order; null = unreadable */
	score: [number | null, number | null];
	/** penalty pill value per team; null = no pill (or unreadable) */
	penalty: [number | null, number | null];
	/** which team held the objective at the read */
	control: [boolean, boolean];
}

/**
 * Objective-counter progress over the match. Samples are chronological and
 * deduped to state changes, with an unchanged state re-confirmed every ~10s
 * while the counter stays on screen — so a larger gap between samples was not
 * observed (capture gap, covered HUD): render it as unknown, don't interpolate.
 */
export interface ScannerMatchObjective {
	mode: "SZ";
	samples: ScannerMatchObjectiveSample[];
}

export type ScannerMatchPlayerFlags = [boolean, boolean, boolean, boolean];

export interface ScannerMatchPlayerStatusSample {
	/** whole seconds into the video/stream the icon strip was read at */
	t: number;
	/** seconds shown on the match timer — the same key the objective samples carry */
	time: number | null;
	/** special held per player, teams in `teams` order, slots in row order */
	special: [ScannerMatchPlayerFlags, ScannerMatchPlayerFlags];
	/** splatted per player, same arrangement */
	dead: [ScannerMatchPlayerFlags, ScannerMatchPlayerFlags];
}

/**
 * Per-player special/death states over the match, read off the icon strip next
 * to the objective counter. Chronological and deduped like the objective
 * samples, re-confirmed every ~6s — render longer gaps as unknown.
 */
export interface ScannerMatchPlayerStatus {
	samples: ScannerMatchPlayerStatusSample[];
}

export interface ScannerMatch {
	/** whole seconds into the video/stream the match starts at */
	startsAt: number | null;
	/** whole seconds into the video/stream the match was last seen at */
	endsAt: number | null;
	/** wall-clock ms: a replay scoreboard's recording time, else the closing scoreboard's detection time; null on VoD scans */
	playedAt: number | null;
	lobby: ScannerLobby | null;
	mode: ModeShort | null;
	stage: StageId | null;
	/**
	 * the "Score:" banner game scores (0-100) in `teams` order from a
	 * results/replay screen; a knockout's winner reports 100. Null when unseen.
	 */
	matchScores: [number | null, number | null] | null;
	replayCode: string | null;
	/** spectator/casted footage (spectator map screen or badge-proven icon strip seen) */
	cast: boolean;
	/**
	 * counter progress samples in `teams` order — the builder tracks each side's
	 * ink color so casted footage's plate swaps can't scramble the series; null
	 * when no counter was read
	 */
	objective: ScannerMatchObjective | null;
	/**
	 * per-player special/death samples in `teams` order, oriented alongside the
	 * objective samples; null when the icon strip was never read
	 */
	playerStatus: ScannerMatchPlayerStatus | null;
	/** on-screen order: scoreboard rows 0-3 are teams[0] (the winners), minimap own side is teams[0] */
	teams: [ScannerMatchTeam, ScannerMatchTeam];
	/** scoreboard-sourced matches know it (0); minimap-only matches don't */
	winner: 0 | 1 | null;
	/** the POV player's seat, when a scoreboard identified it */
	pov: { team: 0 | 1; index: number } | null;
}
