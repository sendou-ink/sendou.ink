import * as R from "remeda";
import * as LiveStream from "~/features/live-streams/core/LiveStream";
import type { StreamPlatform } from "~/features/live-streams/live-streams-constants";
import * as LobbyRepository from "~/features/lobbies/LobbyRepository.server";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import { cachedStreams } from "~/features/sendouq-streams/core/streams.server";
import type {
	Tournament,
	TournamentStream,
} from "~/features/tournament-bracket/core/Tournament";
import * as UserActivity from "~/features/user-activity/core/UserActivity.server";
import {
	type FriendActivityType,
	SENDOUQ_ACTIVITY_LABEL,
} from "./friends-constants";

export interface FriendActivity {
	type: FriendActivityType | null;
	subtitle: string | null;
	badge: string | null;
	matchId: number | null;
	tournamentId: number | null;
	lobbyId: number | null;
	/** Set when the friend's current match can be watched, making the activity show up as "LIVE". */
	stream: FriendActivityStream | null;
}

interface FriendActivityStream {
	url: string;
	platform: StreamPlatform;
}

/** The soonest upcoming lobby each friend of the viewer signed up for that the viewer may see and join, keyed by friend id. */
export async function resolveUpcomingLobbiesOfFriends(viewerId: number) {
	const rows = await LobbyRepository.findAllUpcomingOfFriendsByUserId(viewerId);

	const result = new Map<number, (typeof rows)[number]>();
	for (const row of rows.toSorted((a, b) => a.startsAt - b.startsAt)) {
		if (!result.has(row.friendId)) result.set(row.friendId, row);
	}

	return result;
}

/** Ids of the lobbies the friends are present in that the viewer may see. */
export async function resolveVisibleActiveLobbyIdsOfFriends({
	viewerId,
	friendIds,
}: {
	viewerId: number;
	friendIds: number[];
}) {
	const lobbyIds = R.unique(
		friendIds.flatMap((friendId) => {
			const lobby = UserActivity.resolve(friendId).lobby;

			return lobby ? [lobby.lobbyId] : [];
		}),
	);

	return new Set(
		await LobbyRepository.findAllVisibleIds({ userId: viewerId, lobbyIds }),
	);
}

/** Stream of each ongoing SendouQ match, keyed by match id. Resolved once per request, activity being resolved per friend. */
export async function resolveSendouQMatchStreams() {
	const streams = await cachedStreams();

	const result = new Map<number, FriendActivityStream>();
	for (const { match, streams: playerStreams } of streams) {
		if (result.has(match.id)) continue;

		result.set(match.id, toActivityStream(playerStreams[0]));
	}

	return result;
}

/**
 * What a friend is currently doing: an ongoing SendouQ or tournament match first, then being in a lobby, then
 * looking for members and last an upcoming lobby the viewer could join.
 */
export function resolveFriendActivity({
	friendId,
	tournamentId,
	tournamentName,
	teamMemberCount,
	tournamentMinTeamSize,
	sendouQMatchStreams,
	visibleLobbyIds,
	upcomingLobby,
}: {
	friendId: number;
	tournamentId: number | null;
	tournamentName: string | null;
	teamMemberCount: number | null;
	tournamentMinTeamSize: number | null;
	sendouQMatchStreams: ReadonlyMap<number, FriendActivityStream>;
	/** Lobbies the viewer may see, see `resolveVisibleActiveLobbyIdsOfFriends` */
	visibleLobbyIds: ReadonlySet<number>;
	/** Upcoming lobby the friend signed up for, visible to the viewer, see `LobbyRepository.findAllUpcomingOfFriendsByUserId` */
	upcomingLobby?: {
		lobbyId: number;
		lobbyName: string;
		participantCount: number | null;
		roomSize: number;
	};
}): FriendActivity {
	const activity = UserActivity.resolve(friendId);
	const ownGroup = activity.sendouq?.group;

	if (ownGroup?.matchId) {
		return {
			type: "SENDOUQ_MATCH",
			subtitle: SENDOUQ_ACTIVITY_LABEL,
			badge: null,
			matchId: ownGroup.matchId,
			tournamentId: null,
			lobbyId: null,
			stream: sendouQMatchStreams.get(ownGroup.matchId) ?? null,
		};
	}

	const tournamentActivity = resolveTournamentActivity(activity, friendId);
	if (tournamentActivity) return tournamentActivity;

	if (activity.lobby && visibleLobbyIds.has(activity.lobby.lobbyId)) {
		return {
			type: "LOBBY",
			subtitle: activity.lobby.lobbyName,
			badge: null,
			matchId: null,
			tournamentId: null,
			lobbyId: activity.lobby.lobbyId,
			stream: null,
		};
	}

	if (
		ownGroup &&
		ownGroup.members.length < FULL_GROUP_SIZE &&
		!activity.sendouq?.expired
	) {
		return {
			type: "SENDOUQ",
			subtitle: SENDOUQ_ACTIVITY_LABEL,
			badge: `${ownGroup.members.length}/${FULL_GROUP_SIZE}`,
			matchId: null,
			tournamentId: null,
			lobbyId: null,
			stream: null,
		};
	}

	if (tournamentName) {
		return {
			type: "TOURNAMENT_SUB",
			subtitle: tournamentName,
			badge: `${teamMemberCount ?? 1}/${tournamentMinTeamSize ?? FULL_GROUP_SIZE}`,
			matchId: null,
			tournamentId,
			lobbyId: null,
			stream: null,
		};
	}

	if (upcomingLobby) {
		return {
			type: "LOBBY_UPCOMING",
			subtitle: upcomingLobby.lobbyName,
			badge: `${upcomingLobby.participantCount ?? 1}/${upcomingLobby.roomSize}`,
			matchId: null,
			tournamentId: null,
			lobbyId: upcomingLobby.lobbyId,
			stream: null,
		};
	}

	return {
		type: null,
		subtitle: null,
		badge: null,
		matchId: null,
		tournamentId: null,
		lobbyId: null,
		stream: null,
	};
}

function resolveTournamentActivity(
	activity: UserActivity.UserActivity,
	friendId: number,
): FriendActivity | null {
	for (const { tournament, status } of activity.tournaments) {
		if (
			status.type === "CHECKIN" ||
			!UserActivity.TOURNAMENT_STATUS_IS_IN_PROGRESS[status.type]
		) {
			continue;
		}

		const isInMatch = status.type === "MATCH";

		return {
			type: isInMatch ? "TOURNAMENT_MATCH" : "TOURNAMENT_WAITING",
			subtitle: tournament.ctx.name,
			badge: null,
			matchId: isInMatch ? status.matchId : null,
			tournamentId: tournament.ctx.id,
			lobbyId: null,
			stream: isInMatch
				? tournamentMatchStream({
						tournament,
						friendId,
						matchId: status.matchId,
						opponentId: status.opponentId,
					})
				: null,
		};
	}

	return null;
}

/** Where the friend's tournament match can be watched, preferring the view showing them best: own stream, teammate's, official cast, opponent's. */
function tournamentMatchStream({
	tournament,
	friendId,
	matchId,
	opponentId,
}: {
	tournament: Tournament;
	friendId: number;
	matchId: number;
	opponentId: number;
}) {
	const streamingParticipants = tournament.streamingParticipants;
	const ownTeamUserIds =
		tournament.teamMemberOfByUser({ id: friendId })?.memberUserIds ?? [];

	const stream =
		participantStream(
			ownTeamUserIds.filter((userId) => userId === friendId),
			streamingParticipants,
		) ??
		participantStream(
			ownTeamUserIds.filter((userId) => userId !== friendId),
			streamingParticipants,
		) ??
		liveCastStream(tournament, matchId) ??
		participantStream(
			tournament.teamById(opponentId)?.memberUserIds ?? [],
			streamingParticipants,
		);

	return stream ? toActivityStream(stream) : null;
}

/** Stream of the account casting the match, only when it is actually streaming right now. */
function liveCastStream(tournament: Tournament, matchId: number) {
	const castAccount = tournament.ctx.castedMatchesInfo?.castedMatches.find(
		(castedMatch) => castedMatch.matchId === matchId,
	);
	if (!castAccount) return null;

	return (
		tournament.streams.find((stream) =>
			LiveStream.isSameAccount(stream, castAccount),
		) ?? null
	);
}

function participantStream(
	userIds: number[],
	streamingParticipants: ReadonlyMap<number, TournamentStream>,
) {
	for (const userId of userIds) {
		const stream = streamingParticipants.get(userId);
		if (stream) return stream;
	}

	return null;
}

function toActivityStream(
	stream: Parameters<typeof LiveStream.url>[0],
): FriendActivityStream {
	return { url: LiveStream.url(stream), platform: stream.platform };
}
