import type {
	ScannerMatch,
	ScannerMatchPlayer,
} from "~/features/scanner/core/scanner-match";
import type { MainWeaponId } from "~/modules/in-game-lists/types";

/** In-game names of the default roster, winners first. */
export const NAMES = ["w1", "w2", "w3", "w4", "l1", "l2", "l3", "l4"];

/** One distinct weapon per player of the default roster, in NAMES order. */
export const WEAPONS: MainWeaponId[] = [10, 20, 30, 40, 50, 60, 70, 80];

/** A scoreboard row with every stat unread, so tests only state what they rely on. */
export function scannerMatchPlayer(
	name: string | null,
	weaponId: MainWeaponId | null,
	partial: Partial<ScannerMatchPlayer> = {},
): ScannerMatchPlayer {
	return {
		name,
		weaponId,
		paint: null,
		ka: null,
		d: null,
		s: null,
		...partial,
	};
}

/** A fully read Splat Zones match on stage 0 where the NAMES/WEAPONS roster's first team wins 100-52. */
export function scannerMatch(
	partial: Partial<ScannerMatch> = {},
): ScannerMatch {
	return {
		startsAt: 100,
		endsAt: 400,
		playedAt: null,
		lobby: "PRIVATE",
		mode: "SZ",
		stage: 0,
		matchScores: [100, 52],
		replayCode: null,
		cast: false,
		objective: null,
		playerStatus: null,
		teams: [
			{
				players: NAMES.slice(0, 4).map((name, i) =>
					scannerMatchPlayer(name, WEAPONS[i]!),
				),
			},
			{
				players: NAMES.slice(4).map((name, i) =>
					scannerMatchPlayer(name, WEAPONS[4 + i]!),
				),
			},
		],
		winner: 0,
		pov: null,
		...partial,
	};
}

/** The same rosters seen from the other side (e.g. a minimap alpha/bravo view). */
export function sideSwapped(match: ScannerMatch): ScannerMatch {
	return {
		...match,
		teams: [match.teams[1], match.teams[0]],
		winner: match.winner === null ? null : match.winner === 0 ? 1 : 0,
		matchScores:
			match.matchScores === null
				? null
				: [match.matchScores[1], match.matchScores[0]],
	};
}
