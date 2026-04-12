import type { SidebarStream } from "~/features/core/streams/streams.server";
import { TIERS, type TierName } from "~/features/mmr/mmr-constants";
import type { TournamentTierNumber } from "~/features/tournament/core/tiering";

type RankedStream = { stream: SidebarStream; score: number };

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

export function tournamentTierToScore(
	tier: TournamentTierNumber | null,
	membersPerTeam?: number,
): number {
	const base = tier ?? 9;
	const isSmallTeamSize = (membersPerTeam ?? 4) < 4;

	return Math.min(9, base + (isSmallTeamSize ? SMALL_TOURNAMENT_PENALTY : 0));
}

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

export function minXpForStreamToBeShown(): number {
	return X_RANK_SCORES.at(-1)?.[0] ?? 3_000;
}

export function xpToScore(peakXp: number): number | null {
	const entry = X_RANK_SCORES.find(([minXp]) => peakXp >= minXp);
	return entry ? entry[1] : null;
}
