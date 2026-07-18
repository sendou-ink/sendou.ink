import type { ActionFunctionArgs } from "react-router";
import { db } from "~/db/sql";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { refreshUserSkills } from "~/features/mmr/tiered.server";
import {
	refreshSendouQInstance,
	SendouQ,
} from "~/features/sendouq/core/SendouQ.server";
import { SENDOUQ_LOOKING_ROOM } from "~/features/sendouq/q-constants";
import { SendouQError } from "~/features/sendouq/q-utils.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as GroupMatchContinueVoteRepository from "~/features/sendouq-match/GroupMatchContinueVoteRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { refreshStreamsCache } from "~/features/sendouq-streams/core/streams.server";
import { logger } from "~/utils/logger";
import {
	errorToast,
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as RejoinVote from "../core/RejoinVote";
import * as SendouQMatch from "../core/SendouQMatch";
import { matchSchema, qMatchPageParamsSchema } from "../q-match-schemas";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const matchId = parseParams({
		params,
		schema: qMatchPageParamsSchema,
	}).id;
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: matchSchema,
	});

	const match = notFoundIfFalsy(await SQMatchRepository.findById(matchId));
	const isStaff = user.roles.includes("STAFF");
	const isParticipant = [
		...match.groupAlpha.members,
		...match.groupBravo.members,
	].some((m) => m.id === user.id);
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
						refreshUserSkills(Seasons.currentOrPrevious()!.nth);
					} catch (error) {
						logger.warn("Error refreshing user skills", error);
					}
					refreshStreamsCache();
				}

				await refreshSendouQInstance();

				if (match.chatCode) {
					if (result.status === "MATCH_FINALIZED") {
						ChatSystemMessage.send({
							room: match.chatCode,
							type: "SCORE_CONFIRMED",
							context: { name: user.username },
						});
					} else {
						ChatSystemMessage.send({
							room: match.chatCode,
							revalidateOnly: true,
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

				const requester = previousGroup.members.find((m) => m.id === user.id);
				errorToastIfFalsy(
					requester?.role === "OWNER",
					"You are not the owner of the group",
				);

				for (const member of previousGroup.members) {
					const currentGroup = SendouQ.findOwnGroup(member.id);
					errorToastIfFalsy(!currentGroup, "Member is already in a group");
				}

				await SQGroupRepository.createGroupFromPrevious({
					previousGroupId: data.previousGroupId,
					members: previousGroup.members.map((m) => ({
						id: m.id,
						role: m.role,
					})),
					status: "ACTIVE",
				});

				await refreshSendouQInstance();

				if (match.chatCode) {
					ChatSystemMessage.send({
						room: match.chatCode,
						revalidateOnly: true,
					});
				}

				// The group re-enters the looking pool, so refresh every looking client.
				ChatSystemMessage.send({
					room: SENDOUQ_LOOKING_ROOM,
					revalidateOnly: true,
				});

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
						await GroupMatchContinueVoteRepository.findForGroups(
							[viewerGroup.id],
							trx,
						);

					if (!RejoinVote.canCastVote(existingVotes, user.id)) {
						return null;
					}

					await GroupMatchContinueVoteRepository.cast(
						{
							groupId: viewerGroup.id,
							isContinuing: data.isContinuing,
						},
						trx,
					);

					return RejoinVote.result(
						await GroupMatchContinueVoteRepository.findForGroups(
							[viewerGroup.id],
							trx,
						),
					);
				});

				if (votingResult?.type === "RESOLVED") {
					const survivors = viewerGroup.members
						.filter((m) => votingResult.continuingUserIds.includes(m.id))
						.map((m) => ({ id: m.id, role: m.role }));

					try {
						await SQGroupRepository.createGroupFromPrevious({
							previousGroupId: viewerGroup.id,
							members: survivors,
							status: "ACTIVE",
						});
					} catch (error) {
						// a concurrent voter may have already created the successor
						// group; the in-memory queue still needs to be refreshed below
						if (!(error instanceof SendouQError)) throw error;
					}

					await refreshSendouQInstance();

					// The continuing group re-enters the looking pool, so refresh
					// every looking client.
					ChatSystemMessage.send({
						room: SENDOUQ_LOOKING_ROOM,
						revalidateOnly: true,
					});
				}

				if (match.chatCode) {
					ChatSystemMessage.send({
						room: match.chatCode,
						revalidateOnly: true,
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

				if (match.chatCode) {
					ChatSystemMessage.send({
						room: match.chatCode,
						revalidateOnly: true,
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

				if (match.chatCode) {
					ChatSystemMessage.send({
						room: match.chatCode,
						revalidateOnly: true,
					});
				}

				break;
			}
			case "REQUEST_CANCEL": {
				const result = await SQMatchRepository.requestCancelMatch({
					matchId,
					requestedByUserId: user.id,
				});

				if (result.status === "ALREADY_LOCKED") {
					return null;
				}
				if (result.status === "ALREADY_REQUESTED") {
					return null;
				}

				if (match.chatCode) {
					ChatSystemMessage.send({
						room: match.chatCode,
						type: "CANCEL_REPORTED",
						context: { name: user.username },
					});
				}

				await refreshSendouQInstance();
				break;
			}
			case "ACCEPT_CANCEL": {
				const result = await SQMatchRepository.acceptCancelMatch({
					matchId,
					acceptedByUserId: user.id,
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

				if (match.chatCode) {
					ChatSystemMessage.send({
						room: match.chatCode,
						type: "CANCEL_CONFIRMED",
						context: { name: user.username },
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
						refreshUserSkills(Seasons.currentOrPrevious()!.nth);
					} catch (error) {
						logger.warn("Error refreshing user skills", error);
					}
					refreshStreamsCache();
				}

				await refreshSendouQInstance();

				if (match.chatCode) {
					ChatSystemMessage.send({
						room: match.chatCode,
						revalidateOnly: true,
					});
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

				if (match.chatCode) {
					ChatSystemMessage.send({
						room: match.chatCode,
						type: "CANCEL_REFUSED",
						context: { name: user.username },
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
		// some errors are expected to happen, for example two requests racing to
		// create/join a group. return null so loaders re-run and the user sees
		// the fresh state instead of an error page
		if (error instanceof SendouQError) {
			return null;
		}

		throw error;
	}

	return null;
};
