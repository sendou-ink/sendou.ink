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
}

/**
 * Resolves everything the user is doing right now (SendouQ + running
 * tournaments) from in-memory state, no DB reads. The single source shared by
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
	};
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
