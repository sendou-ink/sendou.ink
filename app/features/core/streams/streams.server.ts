import { addDays } from "date-fns";
import type { TournamentTierNumber } from "~/features/tournament/core/tiering";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import type {
	Tournament,
	TournamentStream,
} from "~/features/tournament-bracket/core/Tournament";
import * as LeagueScheduling from "~/features/tournament-match/core/LeagueScheduling";
import { cache } from "~/utils/cache.server";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { tournamentMatchPage, tournamentStreamsPage } from "~/utils/urls";

export const COMBINED_STREAMS_KEY = "combined-streams";

/** Sets the organizer marked for cast show up as upcoming this many days ahead. */
const UPCOMING_LEAGUE_CAST_WINDOW_DAYS = 3;

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

/** One entry per streamed tournament, and per streamed league set as those are played on their own schedule. */
export function getLiveTournamentStreams(): SidebarStream[] {
	const streams: SidebarStream[] = [];

	for (const tournament of RunningTournaments.all) {
		if (tournament.isLeague) {
			for (const set of liveLeagueSets(tournament)) {
				streams.push({
					...leagueSetStream(tournament, set),
					startsAt: LeagueScheduling.liveWindow(set.scheduledAt).startsAt,
				});
			}
			continue;
		}

		if (tournament.streams.length === 0) continue;

		streams.push({
			id: `tournament-${tournament.ctx.id}`,
			name: tournament.ctx.name,
			imageUrl: tournament.ctx.logoUrl,
			url: tournamentStreamsPage(tournament.ctx.id),
			subtitle: deriveCurrentRound(tournament),
			startsAt: dateToDatabaseTimestamp(tournament.ctx.startsAt),
			tier: tournament.ctx.tier,
			membersPerTeam: tournament.minMembersPerTeam,
		});
	}

	return streams;
}

/** League sets the organizer marked for cast, coming up within days, so they show as upcoming even with nobody live yet. */
export function getUpcomingLeagueCastStreams(): SidebarStream[] {
	const now = databaseTimestampNow();
	const horizon = dateToDatabaseTimestamp(
		addDays(new Date(), UPCOMING_LEAGUE_CAST_WINDOW_DAYS),
	);
	const liveIds = new Set(
		getLiveTournamentStreams().map((stream) => stream.id),
	);

	return RunningTournaments.all.flatMap((tournament) => {
		if (!tournament.isLeague) return [];

		return leagueSets(tournament).flatMap((set) => {
			const stream = leagueSetStream(tournament, set);
			if (liveIds.has(stream.id)) return [];
			if (set.castAccount === null) return [];
			if (set.hasWinner) return [];
			if (set.scheduledAt < now || set.scheduledAt > horizon) return [];

			return [{ ...stream, startsAt: set.scheduledAt }];
		});
	});
}

/** Lowercased Twitch usernames of all members and casters streaming a currently live tournament or league set. */
export function getLiveTournamentStreamerTwitchNames(): string[] {
	const names: string[] = [];

	for (const tournament of RunningTournaments.all) {
		const streams = tournament.isLeague
			? liveLeagueSets(tournament).flatMap((set) => set.streams)
			: tournament.streams;

		for (const stream of streams) {
			names.push(stream.twitchUserName.toLowerCase());
		}
	}

	return names;
}

interface LeagueSet {
	id: number;
	bracketIdx: number;
	scheduledAt: number;
	hasWinner: boolean;
	teamNames: [string, string];
	memberUserIds: number[];
	/** The Twitch account the organizer marked the set to be casted on, if any. */
	castAccount: string | null;
}

/** Every set of the league with an agreed time and both teams. */
function leagueSets(tournament: Tournament): LeagueSet[] {
	const castByMatchId = new Map(
		[
			...(tournament.ctx.castedMatchesInfo?.lockedMatches ?? []),
			...(tournament.ctx.castedMatchesInfo?.castedMatches ?? []),
		].map((cast) => [cast.matchId, cast.twitchAccount]),
	);

	return tournament.brackets.flatMap((bracket, bracketIdx) => {
		if (bracket.preview) return [];

		return bracket.data.match.flatMap((match) => {
			const teamOne = match.opponent1?.id
				? tournament.teamById(match.opponent1.id)
				: null;
			const teamTwo = match.opponent2?.id
				? tournament.teamById(match.opponent2.id)
				: null;
			if (!teamOne || !teamTwo || typeof match.scheduledAt !== "number") {
				return [];
			}

			return [
				{
					id: match.id,
					bracketIdx,
					scheduledAt: match.scheduledAt,
					hasWinner: match.winnerSide !== null,
					teamNames: [teamOne.name, teamTwo.name] as [string, string],
					memberUserIds: [...teamOne.memberUserIds, ...teamTwo.memberUserIds],
					castAccount: castByMatchId.get(match.id) ?? null,
				},
			];
		});
	});
}

/** League sets inside their live window that a member of either team, or their cast account, streams. */
function liveLeagueSets(
	tournament: Tournament,
): Array<LeagueSet & { streams: TournamentStream[] }> {
	const now = databaseTimestampNow();

	return leagueSets(tournament).flatMap((set) => {
		if (
			!LeagueScheduling.isLive({
				scheduledAt: set.scheduledAt,
				hasWinner: set.hasWinner,
				now,
			})
		) {
			return [];
		}

		const streams = tournament.streams.filter(
			(stream) =>
				(stream.userId !== null && set.memberUserIds.includes(stream.userId)) ||
				(set.castAccount !== null &&
					stream.twitchUserName.toLowerCase() ===
						set.castAccount.toLowerCase()),
		);
		if (streams.length === 0) return [];

		return [{ ...set, streams }];
	});
}

function leagueSetStream(
	tournament: Tournament,
	set: LeagueSet,
): SidebarStream {
	const divisionIdx = tournament.leagueDivisionOfBracket(set.bracketIdx);
	const divisionName = tournament.leagueDivisions.find(
		(division) => division.idx === divisionIdx,
	)?.name;

	return {
		id: `league-match-${set.id}`,
		name: `${set.teamNames[0]} vs. ${set.teamNames[1]}`,
		imageUrl: tournament.ctx.logoUrl,
		url: tournamentMatchPage({
			tournamentId: tournament.ctx.id,
			matchId: set.id,
		}),
		subtitle: divisionName
			? `${divisionName} · ${tournament.ctx.name}`
			: tournament.ctx.name,
		startsAt: set.scheduledAt,
		tier: tournament.divisionTierOfBracket(set.bracketIdx),
		membersPerTeam: tournament.minMembersPerTeam,
	};
}

function deriveCurrentRound(tournament: Tournament): string {
	for (const bracket of tournament.brackets.toReversed()) {
		if (bracket.preview) continue;
		if (bracket.isUnderground) continue;

		for (const match of bracket.data.match) {
			if (bracket.matchStatus(match.id) !== "STARTED") continue;

			const context = tournament.matchContextNamesById(match.id);
			if (context?.roundNameWithoutMatchIdentifier) {
				return context.roundNameWithoutMatchIdentifier;
			}
		}

		return bracket.name;
	}

	return "";
}
