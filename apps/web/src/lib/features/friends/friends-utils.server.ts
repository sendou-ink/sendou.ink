import {
	FULL_GROUP_SIZE,
	findOwnGroupLite,
	groupExpiryStatus,
	type LiteGroup,
} from "#lib/features/sendouq/q-groups.server.ts";
import { cachedStreams } from "#lib/features/sendouq-streams/streams.server.ts";
import { twitchUrl } from "#lib/utils/urls.ts";
import {
	type FriendActivityType,
	SENDOUQ_ACTIVITY_LABEL,
} from "./friends-constants.ts";

export interface FriendActivity {
	type: FriendActivityType | null;
	subtitle: string | null;
	badge: string | null;
	matchId: number | null;
	tournamentId: number | null;
	/** Set when the friend's current match can be watched, making the activity show up as "LIVE". */
	streamUrl: string | null;
}

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
 * prioritizing in-progress activity (an ongoing SendouQ match) over
 * looking-for-members activity.
 *
 * Port note: tournament activity (`TOURNAMENT_MATCH`/`TOURNAMENT_WAITING`)
 * needs the tournament cluster's in-process state and returns with that
 * migration; until then a friend playing a tournament shows as inactive.
 */
export function resolveFriendActivity({
	friendId,
	tournamentId,
	tournamentName,
	teamMemberCount,
	tournamentMinTeamSize,
	sendouQMatchStreams,
	sendouQGroups,
}: {
	friendId: number;
	tournamentId: number | null;
	tournamentName: string | null;
	teamMemberCount: number | null;
	tournamentMinTeamSize: number | null;
	sendouQMatchStreams: ReadonlyMap<number, string>;
	sendouQGroups: LiteGroup[];
}): FriendActivity {
	const ownGroup = findOwnGroupLite(sendouQGroups, friendId);

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

	if (
		ownGroup &&
		ownGroup.memberUserIds.length < FULL_GROUP_SIZE &&
		groupExpiryStatus(ownGroup.latestActionAt) !== "EXPIRED"
	) {
		return {
			type: "SENDOUQ",
			subtitle: SENDOUQ_ACTIVITY_LABEL,
			badge: `${ownGroup.memberUserIds.length}/${FULL_GROUP_SIZE}`,
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
