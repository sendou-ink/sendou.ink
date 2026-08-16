export const TOURNAMENT_STAFF_ROLES = ["ORGANIZER", "STREAMER"] as const;
export type TournamentStaffRole = (typeof TOURNAMENT_STAFF_ROLES)[number];

const TIER_TO_NUMBER = {
	X: 1,
	"S+": 2,
	S: 3,
	"A+": 4,
	A: 5,
	"B+": 6,
	B: 7,
	"C+": 8,
	C: 9,
} as const;

export type TournamentTier = keyof typeof TIER_TO_NUMBER;
export type TournamentTierNumber = (typeof TIER_TO_NUMBER)[TournamentTier];

/**
 * The subset of the React app's `TournamentSettings` JSON payload that migrated
 * features read. Columns not listed here are simply not typed yet.
 */
export interface TournamentSettingsLite {
	isRanked?: boolean;
	isTest?: boolean;
	minMembersPerTeam?: number;
	regClosesAt?: number;
}
