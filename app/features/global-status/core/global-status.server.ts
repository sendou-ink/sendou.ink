import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import * as SendouQMatch from "~/features/sendouq-match/core/SendouQMatch";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import type { TournamentTeamMemberProgressStatus } from "~/features/tournament-bracket/core/Tournament";
import { tournamentBracketsPage } from "~/features/tournament-bracket/tournament-bracket-urls";
import * as UserActivity from "~/features/user-activity/core/UserActivity.server";
import {
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PREPARING_PAGE,
	SENDOUQ_READY_PAGE,
	sendouQMatchPage,
	tournamentMatchPage,
	tournamentRegisterPage,
} from "~/utils/urls";
import type { GlobalStatus } from "../GlobalStatusProvider";

const TOURNAMENT_STATUS_URGENCY: Record<
	TournamentTeamMemberProgressStatus["type"],
	number
> = {
	MATCH: 0,
	CHECKIN: 1,
	WAITING_FOR_MATCH: 2,
	WAITING_FOR_CAST: 2,
	WAITING_FOR_ROUND: 2,
	WAITING_FOR_GROUPS: 2,
	WAITING_FOR_BRACKET: 3,
	THANKS_FOR_PLAYING: 3,
};

/**
 * Resolves the status shown in the app header, or null when the user has
 * nothing ongoing. SendouQ states always beat tournament states; leagues are
 * excluded. The one DB read happens only when the user is in a SendouQ match.
 */
export async function resolveGlobalStatus(
	userId: number,
): Promise<GlobalStatus | null> {
	const activity = UserActivity.resolve(userId);

	return (
		(await resolveSendouQStatus(activity)) ?? resolveTournamentStatus(activity)
	);
}

async function resolveSendouQStatus(
	activity: UserActivity.UserActivity,
): Promise<GlobalStatus | null> {
	if (!activity.sendouq) return null;

	const { group, likesReceivedCount } = activity.sendouq;
	const groupSize = { members: group.members.length, max: FULL_GROUP_SIZE };

	if (group.status === "PREPARING") {
		return { state: "SQ_PREPARING", url: SENDOUQ_PREPARING_PAGE, groupSize };
	}

	if (group.matchId) {
		return resolveSendouQMatchStatus(group.matchId);
	}

	if (group.status === "READY_CHECK") {
		return { state: "SQ_READY_CHECK", url: SENDOUQ_READY_PAGE };
	}

	return {
		state: "SQ_QUEUED",
		url: SENDOUQ_LOOKING_PAGE,
		groupSize,
		count: likesReceivedCount,
		groupId: group.id,
	};
}

async function resolveSendouQMatchStatus(
	matchId: number,
): Promise<GlobalStatus | null> {
	const match = await SQMatchRepository.findScoreStateById(matchId);
	if (!match || match.isLocked || match.isCanceled) return null;

	const { isDecisive } = SendouQMatch.score({
		mapList: match.mapList,
		groupAlpha: { id: match.alphaGroupId },
		groupBravo: { id: match.bravoGroupId },
	});

	return {
		state: isDecisive ? "SQ_AWAITING_REPORT" : "SQ_MATCH",
		url: sendouQMatchPage(matchId),
	};
}

function resolveTournamentStatus(
	activity: UserActivity.UserActivity,
): GlobalStatus | null {
	const relevant = activity.tournaments.filter(
		({ status }) => UserActivity.TOURNAMENT_STATUS_IS_IN_PROGRESS[status.type],
	);

	const mostUrgent = relevant.sort(
		(a, b) =>
			TOURNAMENT_STATUS_URGENCY[a.status.type] -
			TOURNAMENT_STATUS_URGENCY[b.status.type],
	)[0];
	if (!mostUrgent) return null;

	const { tournament, status } = mostUrgent;
	const tournamentId = tournament.ctx.id;
	const logoUrl = tournament.ctx.logoUrl ?? undefined;

	switch (status.type) {
		case "MATCH":
			return {
				state: "TO_MATCH",
				url: tournamentMatchPage({ tournamentId, matchId: status.matchId }),
				logoUrl,
			};
		case "CHECKIN":
			return {
				state: "TO_CHECKIN",
				url:
					"bracketIdx" in status
						? tournamentBracketsPage({
								tournamentId,
								bracketIdx: status.bracketIdx,
							})
						: tournamentRegisterPage(tournamentId),
				logoUrl,
			};
		case "WAITING_FOR_CAST":
			return {
				state: "TO_WAITING_FOR_CAST",
				url: tournamentBracketsPage({ tournamentId }),
				logoUrl,
			};
		default:
			return {
				state: "TO_WAITING_FOR_MATCH",
				url: tournamentBracketsPage({ tournamentId }),
				logoUrl,
			};
	}
}
