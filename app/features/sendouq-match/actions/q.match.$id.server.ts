import type { ActionFunctionArgs } from "react-router";
import * as R from "remeda";
import { db } from "~/db/sql";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { chatRoomChannel } from "~/features/events/events-types";
import * as Seasons from "~/features/mmr/core/Seasons";
import { refreshUserSkills } from "~/features/mmr/tiered.server";
import {
	refreshSendouQInstance,
	SendouQ,
} from "~/features/sendouq/core/SendouQ.server";
import { SENDOUQ_LOOKING_CHANNEL } from "~/features/sendouq/q-constants";
import { SendouQError } from "~/features/sendouq/q-utils.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as GroupMatchContinueVoteRepository from "~/features/sendouq-match/GroupMatchContinueVoteRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { refreshStreamsCache } from "~/features/sendouq-streams/core/streams.server";
import { parseFormData } from "~/form/parse.server";
import { logger } from "~/utils/logger";
import {
	errorToast,
	errorToastIfFalsy,
	notFoundIfNullish,
	parseParams,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { sendMatchCanceledWebhook } from "../core/discord-webhook.server";
import * as RejoinVote from "../core/RejoinVote";
import * as SendouQMatch from "../core/SendouQMatch";
import { matchSchema, qMatchPageParamsSchema } from "../q-match-schemas";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const matchId = parseParams({
		params,
		schema: qMatchPageParamsSchema,
	}).id;
	const user = requireUser();
	const result = await parseFormData({
		request,
		schema: matchSchema,
	});
	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}
	const data = result.data;

	const match = notFoundIfNullish(await SQMatchRepository.findById(matchId));
	const isStaff = user.roles.includes("STAFF");
	const isParticipant = SendouQMatch.allMembers(match).some(
		(m) => m.id === user.id,
	);
	errorToastIfFalsy(
		isParticipant || isStaff,
		"Not a participant of this match",
	);

	try {
		switch (data._action) {
			case "REPORT_SCORE": {
				const isStaffReport = !isParticipant && isStaff;

				const result = await SQMatchRepository.reportMapWinner({
					matchId,
					winnerId: data.winnerId,
					reportedByUserId: user.id,
					reportedCount: data.reportedCount,
					isStaffReport,
				});

				if (result.status === "ALREADY_LOCKED" || result.status === "STALE") {
					return null;
				}

				if (result.status === "INVALID_WINNER") {
					return errorToast("Invalid winner id");
				}

				if (result.status === "SCORE_DISAGREEMENT") {
					await refreshSendouQInstance();
					return errorToast(
						"Score does not match the other team's report. Contact the other team to adjust.",
					);
				}

				if (result.status === "MATCH_FINALIZED") {
					try {
						await refreshUserSkills(Seasons.currentOrPrevious()!.nth);
					} catch (error) {
						logger.warn("Error refreshing user skills", error);
					}
					refreshStreamsCache();
				}

				await refreshSendouQInstance();

				if (match.chatRoomId) {
					if (result.status === "MATCH_FINALIZED") {
						ChatSystemMessage.sendPersisted({
							roomId: match.chatRoomId,
							type: "SCORE_CONFIRMED",
							authorUserId: user.id,
						});
					} else {
						ChatSystemMessage.send({
							channel: chatRoomChannel(match.chatRoomId),
						});
					}
				}

				break;
			}
			case "LOOK_AGAIN": {
				const season = Seasons.current();
				errorToastIfFalsy(season, "Season is not active");

				const previousGroup =
					match.groupAlpha.id === data.previousGroupId
						? match.groupAlpha
						: match.groupBravo.id === data.previousGroupId
							? match.groupBravo
							: null;
				errorToastIfFalsy(
					previousGroup,
					"Previous group not found in this match",
				);

				errorToastIfFalsy(
					!previousGroup.matchmade,
					"This group must use the continue vote",
				);

				errorToastIfFalsy(
					previousGroup.members.some((m) => m.id === user.id),
					"Not a member of the group",
				);

				for (const member of previousGroup.members) {
					const currentGroup = SendouQ.findOwnGroup(member.id);
					errorToastIfFalsy(!currentGroup, "Member is already in a group");
				}

				await SQGroupRepository.insertFromPrevious({
					previousGroupId: data.previousGroupId,
					memberUserIds: previousGroup.members.map((m) => m.id),
					status: "ACTIVE",
				});

				await refreshSendouQInstance();

				if (match.chatRoomId) {
					ChatSystemMessage.send({
						channel: chatRoomChannel(match.chatRoomId),
					});
				}

				// the group re-enters the looking pool
				ChatSystemMessage.send({ channel: SENDOUQ_LOOKING_CHANNEL });

				break;
			}
			case "CAST_CONTINUE_VOTE": {
				errorToastIfFalsy(Seasons.current(), "Season is not active");

				const viewerSide = SendouQMatch.resolveGroupMemberOf({
					groupAlpha: match.groupAlpha,
					groupBravo: match.groupBravo,
					userId: user.id,
				});
				errorToastIfFalsy(viewerSide, "Not a participant");

				const viewerGroup =
					viewerSide === "ALPHA" ? match.groupAlpha : match.groupBravo;
				errorToastIfFalsy(
					viewerGroup.matchmade,
					"This group uses the trusted rematch flow",
				);

				const votingResult = await db.transaction().execute(async (trx) => {
					const existingVotes =
						await GroupMatchContinueVoteRepository.findAllByGroupIds(
							[viewerGroup.id],
							trx,
						);

					if (
						!RejoinVote.canCastVote(existingVotes, user.id, data.isContinuing)
					) {
						return null;
					}

					await GroupMatchContinueVoteRepository.castOwnVote(
						{
							groupId: viewerGroup.id,
							isContinuing: data.isContinuing,
						},
						trx,
					);

					return RejoinVote.result(
						await GroupMatchContinueVoteRepository.findAllByGroupIds(
							[viewerGroup.id],
							trx,
						),
					);
				});

				if (votingResult?.type === "RESOLVED") {
					const survivors = viewerGroup.members.filter((m) =>
						votingResult.continuingUserIds.includes(m.id),
					);

					try {
						await SQGroupRepository.insertFromPrevious({
							previousGroupId: viewerGroup.id,
							memberUserIds: survivors.map((m) => m.id),
							status: "ACTIVE",
						});
					} catch (error) {
						// a concurrent voter may have already created the successor
						// group; the in-memory queue still needs to be refreshed below
						if (!(error instanceof SendouQError)) throw error;
					}

					await refreshSendouQInstance();

					// non-continuing members lose the group room
					ChatSystemMessage.notifyRoomsChanged(
						viewerGroup.members.map((member) => member.id),
					);

					// the continuing group re-enters the looking pool
					ChatSystemMessage.send({ channel: SENDOUQ_LOOKING_CHANNEL });
				}

				if (match.chatRoomId) {
					ChatSystemMessage.send({
						channel: chatRoomChannel(match.chatRoomId),
					});
				}

				break;
			}
			case "REPORT_WEAPON": {
				await ReportedWeaponRepository.upsertOwn({
					groupMatchId: matchId,
					mapIndex: data.mapIndex,
					weaponSplId: data.weaponSplId,
				});

				break;
			}
			case "UNDO_WEAPON_REPORT": {
				await ReportedWeaponRepository.deleteOwnByMapIndex({
					matchId,
					mapIndex: data.mapIndex,
				});

				break;
			}
			case "UNDO_MATCH_REPORT": {
				const result = await SQMatchRepository.undoMatchReport({
					matchId,
					requestedByUserId: user.id,
					isStaff,
				});

				if (result.status === "NOT_ALLOWED") {
					return errorToast("Cannot undo report");
				}
				if (result.status === "ALREADY_LOCKED") {
					return null;
				}

				await refreshSendouQInstance();

				if (match.chatRoomId) {
					ChatSystemMessage.send({
						channel: chatRoomChannel(match.chatRoomId),
					});
				}

				break;
			}
			case "UNDO_MAP_REPORT": {
				const result = await SQMatchRepository.undoMapReport({
					matchId,
					mapIndex: data.mapIndex,
				});

				if (result.status === "NOT_ALLOWED") {
					return errorToast("Cannot undo map report");
				}
				if (result.status === "ALREADY_LOCKED") {
					return null;
				}

				await refreshSendouQInstance();

				if (match.chatRoomId) {
					ChatSystemMessage.send({
						channel: chatRoomChannel(match.chatRoomId),
					});
				}

				break;
			}
			case "REQUEST_CANCEL": {
				const result = await SQMatchRepository.requestCancelMatch({
					matchId,
					requestedByUserId: user.id,
					reason: data.reason,
					nominatedUserIds: parseNominatedUserIds(data.nominatedUserIds, match),
				});

				if (result.status === "ALREADY_LOCKED") {
					return null;
				}
				if (result.status === "ALREADY_REQUESTED") {
					return null;
				}

				if (match.chatRoomId) {
					ChatSystemMessage.sendPersisted({
						roomId: match.chatRoomId,
						type: "CANCEL_REPORTED",
						authorUserId: user.id,
					});
				}

				await refreshSendouQInstance();
				break;
			}
			case "ACCEPT_CANCEL": {
				const result = await SQMatchRepository.acceptCancelMatch({
					matchId,
					acceptedByUserId: user.id,
					reason: data.reason,
					nominatedUserIds: parseNominatedUserIds(data.nominatedUserIds, match),
				});

				if (result.status === "ALREADY_LOCKED") {
					return null;
				}
				if (result.status === "NO_CANCEL_REQUEST") {
					return null;
				}
				if (result.status === "NOT_ALLOWED") {
					return errorToast("Cannot accept own cancel request");
				}

				await notifyStaffOfCanceledMatch(match);

				if (match.chatRoomId) {
					ChatSystemMessage.sendPersisted({
						roomId: match.chatRoomId,
						type: "CANCEL_CONFIRMED",
						authorUserId: user.id,
					});
				}

				await refreshSendouQInstance();
				break;
			}
			case "ADMIN_CANCEL": {
				errorToastIfFalsy(isStaff, "Only mods can admin cancel");

				const result = await SQMatchRepository.cancelMatch({
					matchId,
					isAdminReport: true,
				});

				if (result.shouldRefreshCaches) {
					try {
						await refreshUserSkills(Seasons.currentOrPrevious()!.nth);
					} catch (error) {
						logger.warn("Error refreshing user skills", error);
					}
					refreshStreamsCache();
				}

				await refreshSendouQInstance();

				if (match.chatRoomId) {
					ChatSystemMessage.send({
						channel: chatRoomChannel(match.chatRoomId),
					});
					// no system message accompanies a staff cancel, so the rooms it
					// just made inactive are announced on their own
					ChatSystemMessage.notifyRoomsChangedByRoomIds([match.chatRoomId]);
				}

				break;
			}
			case "REFUSE_CANCEL": {
				const result = await SQMatchRepository.refuseCancelMatch({
					matchId,
					refusedByUserId: user.id,
				});

				if (result.status === "ALREADY_LOCKED") {
					return null;
				}
				if (result.status === "NO_CANCEL_REQUEST") {
					return null;
				}
				if (result.status === "NOT_ALLOWED") {
					return errorToast("Cannot refuse own cancel request");
				}

				if (match.chatRoomId) {
					ChatSystemMessage.sendPersisted({
						roomId: match.chatRoomId,
						type: "CANCEL_REFUSED",
						authorUserId: user.id,
					});
				}

				await refreshSendouQInstance();
				break;
			}
			default: {
				assertUnreachable(data);
			}
		}
	} catch (error) {
		// expected errors (two requests racing to create/join a group): return null so
		// loaders re-run and the user sees the fresh state instead of an error page
		if (error instanceof SendouQError) {
			return null;
		}

		throw error;
	}

	return null;
};

type MatchById = NonNullable<
	Awaited<ReturnType<typeof SQMatchRepository.findById>>
>;

function parseNominatedUserIds(nominatedUserIds: string[], match: MatchById) {
	const userIds = nominatedUserIds.map(Number);
	const memberIds = SendouQMatch.allMembers(match).map((member) => member.id);
	errorToastIfFalsy(
		userIds.every((userId) => memberIds.includes(userId)),
		"Nominated players must be participants of the match",
	);

	return userIds;
}

async function notifyStaffOfCanceledMatch(match: MatchById) {
	try {
		const reports = await SQMatchRepository.findCancelReportsByGroupMatchId(
			match.id,
		);
		const nominatedUserIds = R.unique(
			reports.flatMap((report) =>
				report.nominatedPlayers.map((player) => player.userId),
			),
		);

		sendMatchCanceledWebhook({
			matchId: match.id,
			members: SendouQMatch.allMembers(match),
			reports,
			nominationCounts:
				await SQMatchRepository.findCancelNominationCountsByUserIds({
					userIds: nominatedUserIds,
					season: Seasons.currentOrPrevious()!.nth,
				}),
		});
	} catch (error) {
		logger.error("Failed to send match canceled webhook", error);
	}
}
