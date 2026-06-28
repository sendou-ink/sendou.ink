import { groupExpiryStatus } from "~/features/sendouq/core/groups";
import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import type { TournamentTeamMemberProgressStatus } from "~/features/tournament-bracket/core/Tournament";
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
}

const TOURNAMENT_STATUS_IS_IN_PROGRESS: Record<
	TournamentTeamMemberProgressStatus["type"],
	boolean
> = {
	MATCH: true,
	WAITING_FOR_MATCH: true,
	WAITING_FOR_CAST: true,
	WAITING_FOR_ROUND: true,
	// to counter 2 day tournaments showing LIVE in between
	WAITING_FOR_BRACKET: false,
	CHECKIN: false,
	THANKS_FOR_PLAYING: false,
};

/**
 * Resolves what a friend is currently doing for display in the friends list,
 * prioritizing in-progress activity (a live SendouQ or tournament match) over
 * looking-for-members activity.
 */
export function resolveFriendActivity({
	friendId,
	tournamentId,
	tournamentName,
	teamMemberCount,
	tournamentMinTeamSize,
}: {
	friendId: number;
	tournamentId: number | null;
	tournamentName: string | null;
	teamMemberCount: number | null;
	tournamentMinTeamSize: number | null;
}): FriendActivity {
	const ownGroup = SendouQ.findOwnGroup(friendId);

	if (ownGroup?.matchId) {
		return {
			type: "SENDOUQ_MATCH",
			subtitle: SENDOUQ_ACTIVITY_LABEL,
			badge: null,
			matchId: ownGroup.matchId,
			tournamentId: null,
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
		};
	}

	if (tournamentName) {
		return {
			type: "TOURNAMENT_SUB",
			subtitle: tournamentName,
			badge: `${teamMemberCount ?? 1}/${tournamentMinTeamSize ?? FULL_GROUP_SIZE}`,
			matchId: null,
			tournamentId,
		};
	}

	return {
		type: null,
		subtitle: null,
		badge: null,
		matchId: null,
		tournamentId: null,
	};
}

function resolveTournamentActivity(friendId: number): FriendActivity | null {
	for (const tournament of RunningTournaments.all) {
		const status = tournament.teamMemberOfProgressStatus({ id: friendId });
		if (!status || !TOURNAMENT_STATUS_IS_IN_PROGRESS[status.type]) continue;

		return {
			type: status.type === "MATCH" ? "TOURNAMENT_MATCH" : "TOURNAMENT_PLAYING",
			subtitle: tournament.ctx.name,
			badge: null,
			matchId: status.type === "MATCH" ? status.matchId : null,
			tournamentId: tournament.ctx.id,
		};
	}

	return null;
}
