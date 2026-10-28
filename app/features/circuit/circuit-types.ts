import type { MainWeaponId, ModeShort } from "~/modules/in-game-lists/types";

export type CircuitRegion = "EU" | "NA" | "JP" | "AU" | "NZ";

export type CircuitSeason = "SPRING" | "FALL";

export interface CircuitEvent {
	id: number;
	name: string;
	isMajor: boolean;
	startsAt: number;
	dayCount: number;
	regions: CircuitRegion[];
	/** Mode played after Splat Zones, null for the major where each team picks their own */
	offMode: Exclude<ModeShort, "SZ"> | null;
	prizeUsd: number;
	result: CircuitEventResult | null;
}

interface CircuitEventResult {
	montage: {
		videoUrl: string;
		posterUrl: string;
	};
	hasReplayCodes: boolean;
	winner: {
		name: string;
		logoUrl: string | null;
		members: Array<{
			id: number;
			username: string;
			avatar: string | null;
			weaponSplId: MainWeaponId;
		}>;
	};
}

export interface CircuitStandingsEntry {
	teamName: string;
	logoUrl: string | null;
	points: number;
}

type CircuitLeaderboardType = "TC_KO_RATE" | "KD";

export interface CircuitLeaderboard {
	type: CircuitLeaderboardType;
	entries: Array<{
		id: number;
		username: string;
		avatar: string | null;
		weaponSplId: MainWeaponId;
		value: number;
	}>;
}
