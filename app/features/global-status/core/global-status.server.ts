import * as R from "remeda";
import { groupExpiresAt } from "~/features/sendouq/core/groups";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import * as SendouQMatch from "~/features/sendouq-match/core/SendouQMatch";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import * as PendingCheckIns from "~/features/tournament/core/PendingCheckIns.server";
import type {
	Tournament,
	TournamentTeamMemberProgressStatus,
} from "~/features/tournament-bracket/core/Tournament";
import { tournamentBracketsPage } from "~/features/tournament-bracket/tournament-bracket-urls";
import { showsOneGroupAtATime } from "~/features/tournament-bracket/tournament-bracket-utils";
import * as UserActivity from "~/features/user-activity/core/UserActivity.server";
import {
	lobbyPage,
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PREPARING_PAGE,
	SENDOUQ_READY_PAGE,
	sendouQMatchPage,
	tournamentMatchPage,
	tournamentRegisterPage,
} from "~/utils/urls";
import type { GlobalStatus } from "../global-status-types";

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
 * excluded. A tournament the user has yet to check in to comes last: it is the
 * only one resolved outside the in-memory activity, as a tournament that has
 * not started is not running.
 */
export async function resolveGlobalStatus(
	userId: number,
): Promise<GlobalStatus | null> {
	const activity = UserActivity.resolve(userId);

	return (
		(await resolveSendouQStatus(activity)) ??
		resolveTournamentStatus(activity) ??
		resolveLobbyStatus(activity) ??
		(await resolvePendingCheckInStatus(userId))
	);
}

function resolveLobbyStatus(
	activity: UserActivity.UserActivity,
): GlobalStatus | null {
	const readyCheckLobbyId = activity.lobbyReadyCheckLobbyId;
	// active in another lobby, they couldn't confirm
	const canConfirmReadyCheck =
		!activity.lobby || activity.lobby.lobbyId === readyCheckLobbyId;
	if (readyCheckLobbyId !== null && canConfirmReadyCheck) {
		return { state: "LOBBY_READY_CHECK", url: lobbyPage(readyCheckLobbyId) };
	}

	if (!activity.lobby) return null;

	return {
		state: activity.lobby.isPlayingSet
			? "LOBBY_MATCH"
			: activity.lobby.isInRoom
				? "LOBBY_IN_ROOM"
				: "LOBBY_WAITING",
		url: lobbyPage(activity.lobby.lobbyId),
	};
}

async function resolvePendingCheckInStatus(
	userId: number,
): Promise<GlobalStatus | null> {
	const pendingCheckIn = await PendingCheckIns.byUserId(userId);
	if (!pendingCheckIn) return null;

	return {
		state: "TO_CHECKIN",
		url: tournamentRegisterPage(pendingCheckIn.tournamentId),
		logoUrl: pendingCheckIn.logoUrl,
		tournamentName: pendingCheckIn.tournamentName,
		checkInClosesAt: pendingCheckIn.checkInClosesAt,
	};
}

async function resolveSendouQStatus(
	activity: UserActivity.UserActivity,
): Promise<GlobalStatus | null> {
	if (!activity.sendouq) return null;

	const { group, likesReceivedCount, expired } = activity.sendouq;
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

	if (expired) {
		return { state: "SQ_EXPIRED", url: SENDOUQ_LOOKING_PAGE };
	}

	return {
		state: "SQ_QUEUED",
		url: SENDOUQ_LOOKING_PAGE,
		groupSize,
		count: likesReceivedCount,
		groupId: group.id,
		expiresAt: groupExpiresAt(group.latestActionAt).getTime(),
	};
}

async function resolveSendouQMatchStatus(
	matchId: number,
): Promise<GlobalStatus | null> {
	const match = await SQMatchRepository.findLiveStateById(matchId);
	if (!match || match.isLocked || match.isCanceled) return null;

	return {
		state: "SQ_MATCH",
		url: sendouQMatchPage(matchId),
		sqMatchId: matchId,
		gameNumber: SendouQMatch.currentGameNumber({
			groupAlpha: { id: match.alphaGroupId },
			groupBravo: { id: match.bravoGroupId },
			mapList: match.mapList,
		}),
	};
}

function resolveTournamentStatus(
	activity: UserActivity.UserActivity,
): GlobalStatus | null {
	const relevant = activity.tournaments.filter(
		(entry) => UserActivity.TOURNAMENT_STATUS_IS_IN_PROGRESS[entry.status.type],
	);

	const mostUrgent = R.firstBy(
		relevant,
		(entry) => TOURNAMENT_STATUS_URGENCY[entry.status.type],
	);
	if (!mostUrgent) return null;

	const { tournament, status } = mostUrgent;
	const tournamentId = tournament.ctx.id;
	const logoUrl = tournament.ctx.logoUrl ?? undefined;
	const tournamentName = tournament.ctx.name;
	const roundName = (matchId: number) =>
		tournament.matchContextNamesById(matchId).roundName;

	switch (status.type) {
		case "MATCH":
			return {
				state: "TO_MATCH",
				url: tournamentMatchPage({ tournamentId, matchId: status.matchId }),
				logoUrl,
				tournamentName,
				roundName: roundName(status.matchId),
			};
		case "CHECKIN":
			if ("bracketIdx" in status) {
				return {
					state: "TO_CHECKIN",
					url: tournamentBracketsPage({
						tournamentId,
						bracketIdx: status.bracketIdx,
					}),
					logoUrl,
					tournamentName,
				};
			}

			return {
				state: "TO_CHECKIN",
				url: tournamentRegisterPage(tournamentId),
				logoUrl,
				tournamentName,
				checkInClosesAt: tournament.regularCheckInEndsAt.getTime(),
			};
		case "WAITING_FOR_CAST":
			return {
				state: "TO_WAITING_FOR_CAST",
				...waitedMatchLink(tournament, status),
				logoUrl,
				tournamentName,
				roundName: roundName(status.matchId),
			};
		case "WAITING_FOR_MATCH":
			return {
				state: "TO_WAITING_FOR_MATCH",
				...waitedMatchLink(tournament, status),
				logoUrl,
				tournamentName,
				roundName: roundName(status.matchId),
			};
		default:
			return {
				state: "TO_WAITING_FOR_MATCH",
				url: tournamentBracketsPage({ tournamentId }),
				logoUrl,
				tournamentName,
			};
	}
}

function waitedMatchLink(
	tournament: Tournament,
	match: { matchId: number; bracketIdx: number; groupId: number },
): Pick<GlobalStatus, "url" | "scrollToMatchId"> {
	const bracket = tournament.bracketMetaByIdx(match.bracketIdx);

	return {
		url: tournamentBracketsPage({
			tournamentId: tournament.ctx.id,
			bracketIdx: match.bracketIdx,
			groupId:
				bracket && showsOneGroupAtATime(bracket) ? match.groupId : undefined,
		}),
		scrollToMatchId: match.matchId,
	};
}
