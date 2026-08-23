/**
 * ScannerMatch — the unit the scanner hands to the rest of sendou.ink: one
 * detected game with everything the scan could read. Built from the event
 * timeline by core/match-builder.ts; validated at the boundaries by
 * scannerMatchSchema (../scanner-schemas.ts). Every field is nullable —
 * a match may be partial (features/scanner-ingest merges partials).
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
	/**
	 * [head, clothes, shoes] ability rows: death screens read whole rows
	 * (main and subs), minimap cards their mains alone
	 */
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
	 * seconds shown on the match timer at the read ("3:35" = 215); null =
	 * unreadable. The game clock is the axis to graph progress on — score
	 * moves at most 1/s against it.
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
 * while the counter stays on screen — so consecutive samples further apart
 * than that were not observed in between (capture gap, covered HUD): render
 * such stretches as unknown instead of interpolating.
 */
export interface ScannerMatchObjective {
	mode: "SZ";
	samples: ScannerMatchObjectiveSample[];
}

export type ScannerMatchPlayerFlags = [boolean, boolean, boolean, boolean];

export interface ScannerMatchPlayerStatusSample {
	/** whole seconds into the video/stream the icon strip was read at */
	t: number;
	/**
	 * seconds shown on the match timer at the read — the same key the
	 * objective samples carry, for charting both on one clock axis
	 */
	time: number | null;
	/** special held per player, teams in `teams` order, slots in row order */
	special: [ScannerMatchPlayerFlags, ScannerMatchPlayerFlags];
	/** splatted per player, same arrangement */
	dead: [ScannerMatchPlayerFlags, ScannerMatchPlayerFlags];
}

/**
 * Per-player special/death states over the match, read off the icon strip
 * next to the objective counter. Chronological and deduped to state
 * changes like the objective samples, with an unchanged state re-confirmed
 * every ~6s — render longer sample gaps as unknown, not as a continued
 * state.
 */
export interface ScannerMatchPlayerStatus {
	samples: ScannerMatchPlayerStatusSample[];
}

export interface ScannerMatch {
	/** whole seconds into the video/stream the match starts at */
	startsAt: number | null;
	/** whole seconds into the video/stream the match was last seen at */
	endsAt: number | null;
	/**
	 * wall-clock ms the game was played: a replay scoreboard's recording
	 * time, else the closing scoreboard's detection time; null on VoD scans
	 */
	playedAt: number | null;
	lobby: ScannerLobby | null;
	mode: ModeShort | null;
	stage: StageId | null;
	/**
	 * the "Score:" banner game scores (0-100) in `teams` order, from a
	 * results/replay screen; a knockout's winner reports 100. Null when no
	 * such screen was seen.
	 */
	matchScores: [number | null, number | null] | null;
	replayCode: string | null;
	/** spectator/casted footage (the 8-player spectator map screen was seen) */
	cast: boolean;
	/**
	 * counter progress samples in `teams` order — the builder tracks each
	 * side's team ink color, so casted footage's plate swaps (the plates
	 * follow the specced player) can't scramble the series; null when no
	 * counter was read
	 */
	objective: ScannerMatchObjective | null;
	/**
	 * per-player special/death samples in `teams` order, oriented alongside
	 * the objective samples (a status read pairs with the counter read of
	 * its frame); null when the icon strip was never read
	 */
	playerStatus: ScannerMatchPlayerStatus | null;
	/**
	 * on-screen order: scoreboard rows 0-3 are teams[0] (the winners),
	 * minimap alpha/own side is teams[0]
	 */
	teams: [ScannerMatchTeam, ScannerMatchTeam];
	/** scoreboard-sourced matches know it (0); minimap-only matches don't */
	winner: 0 | 1 | null;
	/** the POV player's seat, when a scoreboard identified it */
	pov: { team: 0 | 1; index: number } | null;
}
