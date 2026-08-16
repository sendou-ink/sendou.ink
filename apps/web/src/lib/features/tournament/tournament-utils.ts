import * as Seasons from "#lib/features/mmr/Seasons.ts";
import type { TournamentTierNumber } from "./tournament-types.ts";

/** Whether a tournament counts for ranked SP, resolved the same way the tournament page does. */
export function tournamentIsRanked({
	isSetAsRanked,
	startsAt,
	minMembersPerTeam,
	isTest,
}: {
	isSetAsRanked?: boolean;
	startsAt: Date;
	minMembersPerTeam: number;
	isTest: boolean;
}) {
	if (isTest) return false;

	const seasonIsActive = Boolean(Seasons.current(startsAt));
	if (!seasonIsActive) return false;

	// 1v1, 2v2 and 3v3 are always considered "gimmicky"
	if (minMembersPerTeam !== 4) return false;

	return isSetAsRanked ?? true;
}

/** Tentative tier of a series: the (upper) median of its recorded tier history. */
export function calculateTentativeTier(
	tierHistory: TournamentTierNumber[],
): TournamentTierNumber | null {
	if (tierHistory.length === 0) return null;

	const sorted = [...tierHistory].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);

	if (sorted.length % 2 === 0) {
		return Math.ceil(
			(sorted[mid - 1] + sorted[mid]) / 2,
		) as TournamentTierNumber;
	}
	return sorted[mid];
}
