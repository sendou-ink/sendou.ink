import { groupExpiryStatus } from "~/features/sendouq/core/groups";
import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import { cachedStreams } from "~/features/sendouq-streams/core/streams.server";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import type {
	Tournament,
	TournamentTeamMemberProgressStatus,
} from "~/features/tournament-bracket/core/Tournament";
import { twitchUrl } from "~/utils/urls";
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
	/** Set when the friend's current match can be watched, making the activity show up as "LIVE". */
	streamUrl: string | null;
}

const TOURNAMENT_STATUS_IS_IN_PROGRESS: Record<
	TournamentTeamMemberProgressStatus["type"],
	boolean
> = {
	MATCH: true,
	WAITING_FOR_MATCH: true,
	WAITING_FOR_CAST: true,
	WAITING_FOR_ROUND: true,
	WAITING_FOR_GROUPS: true,
	// to counter 2 day tournaments showing as in progress in between
	WAITING_FOR_BRACKET: false,
	CHECKIN: false,
	THANKS_FOR_PLAYING: false,
};

/**
 * Twitch account streaming each ongoing SendouQ match, keyed by match id. Resolved
 * once per request as activity is resolved separately for every friend.
 */
export async function resolveSendouQMatchStreams() {
	const streams = await cachedStreams();

	const result = new Map<number, string>();
	for (const { match, stream } of streams) {
		if (!stream.twitchUserName || result.has(match.id)) continue;

		result.set(match.id, stream.twitchUserName);
	}

	return result;
}

/**
 * Resolves what a friend is currently doing for display in the friends list,
 * prioritizing in-progress activity (an ongoing SendouQ or tournament match) over
 * looking-for-members activity.
 */
export function resolveFriendActivity({
	friendId,
	tournamentId,
	tournamentName,
	teamMemberCount,
	tournamentMinTeamSize,
	sendouQMatchStreams,
}: {
	friendId: number;
	tournamentId: number | null;
	tournamentName: string | null;
	teamMemberCount: number | null;
	tournamentMinTeamSize: number | null;
	sendouQMatchStreams: ReadonlyMap<number, string>;
}): FriendActivity {
	const ownGroup = SendouQ.findOwnGroup(friendId);

	if (ownGroup?.matchId) {
		const twitchAccount = sendouQMatchStreams.get(ownGroup.matchId);

		return {
			type: "SENDOUQ_MATCH",
			subtitle: SENDOUQ_ACTIVITY_LABEL,
			badge: null,
			matchId: ownGroup.matchId,
			tournamentId: null,
			streamUrl: twitchAccount ? twitchUrl(twitchAccount) : null,
		};
	}

	const tournamentActivity = resolveTournamentActivity(friendId);
	if (tournamentActivity) return tournamentActivity;

	if (
		ownGroup &&
		ownGroup.members.length < FULL_GROUP_SIZE &&
		groupExpiryStatus(ownGroup.latestActionAt) !== "EXPIRED"
	) {
		return {
			type: "SENDOUQ",
			subtitle: SENDOUQ_ACTIVITY_LABEL,
			badge: `${ownGroup.members.length}/${FULL_GROUP_SIZE}`,
			matchId: null,
			tournamentId: null,
			streamUrl: null,
		};
	}

	if (tournamentName) {
		return {
			type: "TOURNAMENT_SUB",
			subtitle: tournamentName,
			badge: `${teamMemberCount ?? 1}/${tournamentMinTeamSize ?? FULL_GROUP_SIZE}`,
			matchId: null,
			tournamentId,
			streamUrl: null,
		};
	}

	return {
		type: null,
		subtitle: null,
		badge: null,
		matchId: null,
		tournamentId: null,
		streamUrl: null,
	};
}

function resolveTournamentActivity(friendId: number): FriendActivity | null {
	for (const tournament of RunningTournaments.all) {
		const status = tournament.teamMemberOfProgressStatus({ id: friendId });
		if (!status || !TOURNAMENT_STATUS_IS_IN_PROGRESS[status.type]) continue;

		const isInMatch = status.type === "MATCH";

		return {
			type: isInMatch ? "TOURNAMENT_MATCH" : "TOURNAMENT_WAITING",
			subtitle: tournament.ctx.name,
			badge: null,
			matchId: isInMatch ? status.matchId : null,
			tournamentId: tournament.ctx.id,
			streamUrl: isInMatch
				? tournamentStreamUrl({
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

/**
 * Where the friend's ongoing tournament match can be watched, preferring the view
 * that shows the friend best: their own stream, then a teammate's stream, then the
 * official cast of the match and finally an opponent's.
 */
function tournamentStreamUrl({
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

	const friendAccount = streamingTwitchAccount(
		ownTeamUserIds.filter((userId) => userId === friendId),
		streamingParticipants,
	);
	if (friendAccount) return twitchUrl(friendAccount);

	const teammateAccount = streamingTwitchAccount(
		ownTeamUserIds.filter((userId) => userId !== friendId),
		streamingParticipants,
	);
	if (teammateAccount) return twitchUrl(teammateAccount);

	const castAccount = liveCastAccount(tournament, matchId);
	if (castAccount) return twitchUrl(castAccount);

	const opponentAccount = streamingTwitchAccount(
		tournament.teamById(opponentId)?.memberUserIds ?? [],
		streamingParticipants,
	);

	return opponentAccount ? twitchUrl(opponentAccount) : null;
}

/** Account casting the match, only when it is actually streaming right now. */
function liveCastAccount(tournament: Tournament, matchId: number) {
	const castAccount = tournament.ctx.castedMatchesInfo?.castedMatches.find(
		(castedMatch) => castedMatch.matchId === matchId,
	)?.twitchAccount;
	if (!castAccount) return null;

	const isLive = tournament.streams.some(
		(stream) =>
			stream.twitchUserName.toLowerCase() === castAccount.toLowerCase(),
	);

	return isLive ? castAccount : null;
}

function streamingTwitchAccount(
	userIds: number[],
	streamingParticipants: ReadonlyMap<number, string>,
) {
	for (const userId of userIds) {
		const twitchAccount = streamingParticipants.get(userId);
		if (twitchAccount) return twitchAccount;
	}

	return null;
}
