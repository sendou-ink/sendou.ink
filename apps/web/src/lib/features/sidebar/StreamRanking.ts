import type { SidebarStream } from "#lib/features/core-streams/streams.server.ts";
import { TIERS, type TierName } from "#lib/features/mmr/mmr-constants.ts";
import type { TournamentTierNumber } from "#lib/features/tournament/tournament-types.ts";

type RankedStream = { stream: SidebarStream; score: number };

/**
 * Score for admin-curated external streams. Below every other source's minimum (0) so they sort
 * to the top of the ranking, reserving the first sidebar slots.
 */
export const EXTERNAL_STREAM_SCORE = -1;

/** Picks the sidebar's streams: best scores first, live streams before upcoming ones. */
export function rank(
	streams: RankedStream[],
	maxStreams: number,
): SidebarStream[] {
	const now = Math.floor(Date.now() / 1000);

	const selected = streams
		.sort((a, b) => a.score - b.score || a.stream.startsAt - b.stream.startsAt)
		.slice(0, maxStreams);

	const live = selected
		.filter((rs) => rs.stream.startsAt <= now)
		.sort((a, b) => a.score - b.score);

	const upcoming = selected
		.filter((rs) => rs.stream.startsAt > now)
		.sort((a, b) => a.stream.startsAt - b.stream.startsAt);

	return [...live, ...upcoming].map((rs) => rs.stream);
}

const SMALL_TOURNAMENT_PENALTY = 4;

/** Score of a live tournament's streams based on its tier and team size. */
export function tournamentTierToScore(
	tier: TournamentTierNumber | null,
	membersPerTeam?: number,
): number {
	const base = tier ?? 9;
	const isSmallTeamSize = (membersPerTeam ?? 4) < 4;

	return Math.min(9, base + (isSmallTeamSize ? SMALL_TOURNAMENT_PENALTY : 0));
}

/** Score of an upcoming tournament based on its (tentative) tier and team size. */
export function upcomingTournamentTierToScore(
	tier: number,
	membersPerTeam?: number,
): number {
	const isSmallTeamSize = (membersPerTeam ?? 4) < 4;

	return Math.min(
		9,
		tier + 4 + (isSmallTeamSize ? SMALL_TOURNAMENT_PENALTY : 0),
	);
}

/** Score of a streamed SendouQ match based on its average tier. */
export function sendouQTierToScore(tier: {
	name: TierName;
	isPlus: boolean;
}): number {
	const baseIndex = TIERS.findIndex((t) => t.name === tier.name);
	if (baseIndex === -1) return 9;
	return Math.min(9, baseIndex * 2 + (tier.isPlus ? 1 : 2));
}

const X_RANK_SCORES = [
	[3800, 5],
	[3600, 6],
	[3400, 7],
	[3200, 8],
	[3000, 9],
] as const;

/** The lowest peak XP that qualifies a player's stream for the sidebar. */
export function minXpForStreamToBeShown(): number {
	return X_RANK_SCORES.at(-1)?.[0] ?? 3_000;
}

/** Score of an X Rank player's stream based on their peak XP, or `null` when too low to show. */
export function xpToScore(peakXp: number): number | null {
	const entry = X_RANK_SCORES.find(([minXp]) => peakXp >= minXp);
	return entry ? entry[1] : null;
}
