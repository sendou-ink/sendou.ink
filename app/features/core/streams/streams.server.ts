import type { TournamentTierNumber } from "~/features/tournament/core/tiering";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { Status } from "~/modules/brackets-model";
import { cache } from "~/utils/cache.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { tournamentStreamsPage } from "~/utils/urls";

export const COMBINED_STREAMS_KEY = "combined-streams";

export function clearCombinedStreamsCache() {
	cache.delete(COMBINED_STREAMS_KEY);
}

export type SidebarStream = {
	id: string;
	name: string;
	imageUrl: string;
	overlayIconUrl?: string;
	url: string;
	subtitle: string;
	startsAt: number;
	tier: TournamentTierNumber | null;
	membersPerTeam?: number;
	tentativeTier?: number;
	peakXp?: number;
	twitchUsername?: string;
};

export function getLiveTournamentStreams(): SidebarStream[] {
	const streams: SidebarStream[] = [];

	for (const tournament of RunningTournaments.all) {
		if (tournament.isLeagueDivision) continue;
		if (tournament.streams.length === 0) continue;

		streams.push({
			id: `tournament-${tournament.ctx.id}`,
			name: tournament.ctx.name,
			imageUrl: tournament.ctx.logoUrl,
			url: tournamentStreamsPage(tournament.ctx.id),
			subtitle: deriveCurrentRound(tournament),
			startsAt: dateToDatabaseTimestamp(tournament.ctx.startTime),
			tier: tournament.ctx.tier,
			membersPerTeam: tournament.minMembersPerTeam,
		});
	}

	return streams;
}

function deriveCurrentRound(tournament: Tournament): string {
	for (const bracket of tournament.brackets.toReversed()) {
		if (bracket.preview) continue;
		if (bracket.isUnderground) continue;

		for (const match of bracket.data.match) {
			const isActive =
				match.status === Status.Ready || match.status === Status.Running;
			const hasParticipants = match.opponent1 && match.opponent2;
			const isNotFinished =
				!match.opponent1?.result && !match.opponent2?.result;

			if (isActive && hasParticipants && isNotFinished) {
				const context = tournament.matchContextNamesById(match.id);
				if (context?.roundNameWithoutMatchIdentifier) {
					return context.roundNameWithoutMatchIdentifier;
				}
			}
		}

		return bracket.name;
	}

	return "";
}
