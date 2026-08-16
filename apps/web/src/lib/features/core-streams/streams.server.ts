import { cache } from "#lib/server/cache.ts";
import type { TournamentTierNumber } from "#lib/features/tournament/tournament-types.ts";

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

/**
 * Port note: the React app derives these from `RunningTournaments` (the
 * tournament cluster's in-process state, fed by the Twitch sync routine). The
 * tournament cluster migrates in a later wave; until then no live tournament
 * streams exist in this app — matching the React app whenever Twitch
 * credentials are absent (the differ/e2e environment).
 */
export function getLiveTournamentStreams(): SidebarStream[] {
	return [];
}

/** Lowercased Twitch usernames of all members and casters streaming a currently live tournament. */
export function getLiveTournamentStreamerTwitchNames(): string[] {
	return [];
}
