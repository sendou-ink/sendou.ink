import { cachified } from "@epic-web/cachified";
import type { TournamentTierNumber } from "~/features/tournament/core/tiering";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { Status } from "~/modules/brackets-model";
import { cache, ttl } from "~/utils/cache.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { tournamentStreamsPage } from "~/utils/urls";

const FIVE_MINUTES = 5 * 60 * 1000;
const MAX_STREAMS = 5;

export function clearLiveStreamsCache() {
	cache.delete("live-tournament-streams");
}

export type SidebarStream = {
	id: number;
	name: string;
	imageUrl: string;
	overlayIconUrl?: string;
	url: string;
	subtitle: string;
	startsAt: number;
	tier: TournamentTierNumber | null;
};

export function getLiveTournamentStreams(): Promise<SidebarStream[]> {
	return cachified({
		key: "live-tournament-streams",
		cache,
		ttl: ttl(FIVE_MINUTES),
		async getFreshValue() {
			const streams: SidebarStream[] = [];

			for (const tournament of RunningTournaments.all) {
				streams.push({
					id: tournament.ctx.id,
					name: tournament.ctx.name,
					imageUrl: tournament.ctx.logoUrl,
					url: tournamentStreamsPage(tournament.ctx.id),
					subtitle: deriveCurrentRound(tournament),
					startsAt: dateToDatabaseTimestamp(tournament.ctx.startTime),
					tier: tournament.ctx.tier,
				});
			}

			return streams.sort(sortByTierAscending).slice(0, MAX_STREAMS);
		},
	});
}

// xxx: this could be moved to Tournament class
// xxx: not always reporting furthest round
function deriveCurrentRound(tournament: Tournament): string {
	for (const bracket of tournament.brackets) {
		if (bracket.preview) continue;

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

function sortByTierAscending(a: SidebarStream, b: SidebarStream): number {
	if (a.tier === null && b.tier === null) return 0;
	if (a.tier === null) return 1;
	if (b.tier === null) return -1;
	return a.tier - b.tier;
}
