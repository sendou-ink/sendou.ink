import * as LobbyActivity from "~/features/lobbies/core/LobbyActivity.server";
import { groupExpiryStatus } from "~/features/sendouq/core/groups";
import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import type {
	Tournament,
	TournamentTeamMemberProgressStatus,
} from "~/features/tournament-bracket/core/Tournament";

export interface UserActivity {
	/** The user's SendouQ group (never INACTIVE), with its pending received likes and expiry resolved. */
	sendouq: {
		group: NonNullable<ReturnType<(typeof SendouQ)["findOwnGroup"]>>;
		likesReceivedCount: number;
		expired: boolean;
	} | null;
	/** The user's status in every running tournament they are playing, in registry order. Leagues are not activity: their matches run over days, not something the user is doing right now. */
	tournaments: Array<{
		tournament: Tournament;
		status: TournamentTeamMemberProgressStatus;
	}>;
	/** The lobby the user is present in (checked in or in a room, not dropping). */
	lobby: {
		lobbyId: number;
		lobbyName: string;
		isInRoom: boolean;
		/** Plays a side of the lobby's unfinished set */
		isPlayingSet: boolean;
	} | null;
	/** Id of the lobby whose ready check asks the user to confirm they're ready to take a vacant spot. */
	lobbyReadyCheckLobbyId: number | null;
}

/**
 * Resolves everything the user is doing right now (SendouQ + running
 * tournaments + lobbies) from in-memory state, no DB reads. The single source shared by
 * the friends sidebar, the public active-match API and the header status
 * indicator; each consumer applies its own priority order.
 */
export function resolve(userId: number): UserActivity {
	const group = SendouQ.findOwnGroup(userId);

	return {
		sendouq: group
			? {
					group,
					likesReceivedCount: SendouQ.likesReceivedCount(group.id),
					expired: groupExpiryStatus(group.latestActionAt) === "EXPIRED",
				}
			: null,
		tournaments: RunningTournaments.all.flatMap((tournament) => {
			if (tournament.isLeague) return [];

			const status = tournament.teamMemberOfProgressStatus({ id: userId });

			return status ? [{ tournament, status }] : [];
		}),
		lobby: resolveLobby(userId),
		lobbyReadyCheckLobbyId: LobbyActivity.findReadyCheckLobbyIdByUserId(userId),
	};
}

function resolveLobby(userId: number): UserActivity["lobby"] {
	const participation = LobbyActivity.findByUserId(userId);
	if (!participation) return null;

	return {
		lobbyId: participation.lobbyId,
		lobbyName: participation.lobbyName,
		isInRoom: participation.status === "IN_ROOM",
		isPlayingSet: participation.isPlayingSet,
	};
}

/**
 * What keeps the user from being active in a lobby: a live SendouQ group or match, playing in a running
 * tournament or being active in another lobby. `null` when nothing does.
 *
 * @param lobbyId the lobby to be active in, already being active in it is no conflict
 */
export function lobbyConflict(
	activity: UserActivity,
	lobbyId?: number,
): "SENDOUQ" | "TOURNAMENT" | "LOBBY" | null {
	if (activity.sendouq && !activity.sendouq.expired) return "SENDOUQ";

	const isPlayingTournament = activity.tournaments.some(
		({ status }) =>
			status.type !== "CHECKIN" &&
			TOURNAMENT_STATUS_IS_IN_PROGRESS[status.type],
	);
	if (isPlayingTournament) return "TOURNAMENT";

	if (activity.lobby && activity.lobby.lobbyId !== lobbyId) return "LOBBY";

	return null;
}

/**
 * Whether a tournament progress status counts as "playing right now". CHECKIN
 * is in-progress for the user themself; the friends projection drops it as a
 * friend needing to check in is not watchable activity.
 */
export const TOURNAMENT_STATUS_IS_IN_PROGRESS: Record<
	TournamentTeamMemberProgressStatus["type"],
	boolean
> = {
	MATCH: true,
	WAITING_FOR_MATCH: true,
	WAITING_FOR_CAST: true,
	WAITING_FOR_ROUND: true,
	WAITING_FOR_GROUPS: true,
	CHECKIN: true,
	// to counter 2 day tournaments showing as in progress in between
	WAITING_FOR_BRACKET: false,
	THANKS_FOR_PLAYING: false,
};
