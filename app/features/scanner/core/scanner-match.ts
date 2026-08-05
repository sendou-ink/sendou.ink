/**
 * ScannerMatch — the unit the scanner hands to the rest of sendou.ink: one
 * detected game with everything the scan could read. Built from the event
 * timeline by core/match-builder.ts; validated at the boundaries by
 * scannerMatchSchema (../scanner-schemas.ts). Every field is nullable —
 * a match may be partial (features/scanner-ingest merges partials).
 */
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { ScannerAbility, ScannerLobby } from "../scanner-types";

export interface ScannerMatchPlayer {
	/** in-game name; null when unread (e.g. minimap POV enemy rows show none) */
	name: string | null;
	/** sendou main-weapon id; null when no frame read the slot */
	weaponId: MainWeaponId | null;
	paint: number | null;
	ka: number | null;
	d: number | null;
	s: number | null;
	/** [head, clothes, shoes] ability rows harvested from death screens */
	abilities?: ScannerAbility[][];
}

export interface ScannerMatchTeam {
	/** the team's game score; null when no results screen was seen */
	score: number | null;
	/** up to 4 players; slots the scan never saw are absent */
	players: ScannerMatchPlayer[];
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
	/** set score from the replay screen, in `teams` order */
	matchScores: [number | null, number | null] | null;
	replayCode: string | null;
	/** spectator/casted footage (the 8-player spectator map screen was seen) */
	cast: boolean;
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
