import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { refreshUserSkills } from "~/features/mmr/tiered.server";
import {
	refreshSendouQInstance,
	SendouQ,
} from "~/features/sendouq/core/SendouQ.server";
import * as PrivateUserNoteRepository from "~/features/sendouq/PrivateUserNoteRepository.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as GroupMatchContinueVoteRepository from "~/features/sendouq-match/GroupMatchContinueVoteRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { refreshStreamsCache } from "~/features/sendouq-streams/core/streams.server";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import {
	errorToast,
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { sendouQMatchPage } from "~/utils/urls";
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

	switch (data._action) {
		case "REPORT_SCORE": {
			const match = notFoundIfFalsy(await SQMatchRepository.findById(matchId));

			const members = [
				...match.groupAlpha.members,
				...match.groupBravo.members,
			];
			const isParticipant = members.some((m) => m.id === user.id);
			const isStaffReport = !isParticipant && user.roles.includes("STAFF");
			errorToastIfFalsy(
				isParticipant || isStaffReport,
				"Not allowed to report score",
			);

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

			if (match.chatCode && result.status === "MATCH_FINALIZED") {
				ChatSystemMessage.send({
					room: match.chatCode,
					type: "SCORE_CONFIRMED",
					context: { name: user.username },
				});
			}

			break;
		}
		case "LOOK_AGAIN": {
			const season = Seasons.current();
			errorToastIfFalsy(season, "Season is not active");

			const match = notFoundIfFalsy(await SQMatchRepository.findById(matchId));
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

			for (const member of previousGroup.members) {
				const currentGroup = SendouQ.findOwnGroup(member.id);
				errorToastIfFalsy(!currentGroup, "Member is already in a group");
				if (member.id === user.id) {
					errorToastIfFalsy(
						member.role === "OWNER",
						"You are not the owner of the group",
					);
				}
			}

			await SQGroupRepository.createGroupFromPrevious({
				previousGroupId: data.previousGroupId,
				members: previousGroup.members.map((m) => ({ id: m.id, role: m.role })),
				status: "ACTIVE",
			});

			await refreshSendouQInstance();

			if (match.chatCode) {
				ChatSystemMessage.send({
					room: match.chatCode,
					revalidateOnly: true,
				});
			}

			break;
		}
		case "CAST_CONTINUE_VOTE": {
			const match = notFoundIfFalsy(await SQMatchRepository.findById(matchId));

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

			if (
				!RejoinVote.canCastVote(
					await GroupMatchContinueVoteRepository.findForGroups([
						viewerGroup.id,
					]),
					user.id,
				)
			) {
				return null;
			}

			await GroupMatchContinueVoteRepository.cast({
				groupId: viewerGroup.id,
				userId: user.id,
				isContinuing: data.isContinuing,
			});

			const votingResult = RejoinVote.result(
				await GroupMatchContinueVoteRepository.findForGroups([viewerGroup.id]),
			);

			if (votingResult.type === "RESOLVED") {
				const survivors = viewerGroup.members
					.filter((m) => votingResult.continuingUserIds.includes(m.id))
					.map((m) => ({ id: m.id, role: m.role }));

				await SQGroupRepository.createGroupFromPrevious({
					previousGroupId: viewerGroup.id,
					members: survivors,
					status: "ACTIVE",
				});

				await refreshSendouQInstance();
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
			const match = notFoundIfFalsy(await SQMatchRepository.findById(matchId));

			const members = [
				...match.groupAlpha.members,
				...match.groupBravo.members,
			];
			invariant(
				members.some((m) => m.id === user.id),
				"User is not a member of any group",
			);

			await ReportedWeaponRepository.upsertOne({
				groupMatchId: matchId,
				mapIndex: data.mapIndex,
				userId: user.id,
				weaponSplId: data.weaponSplId,
			});

			break;
		}
		case "UNDO_WEAPON_REPORT": {
			notFoundIfFalsy(await SQMatchRepository.findById(matchId));

			await ReportedWeaponRepository.deleteByUserMapIndex({
				matchId,
				userId: user.id,
				mapIndex: data.mapIndex,
			});

			break;
		}
		case "ADD_PRIVATE_USER_NOTE": {
			await PrivateUserNoteRepository.upsert({
				authorId: user.id,
				sentiment: data.sentiment,
				targetId: data.targetId,
				text: data.comment,
			});

			throw redirect(sendouQMatchPage(matchId));
		}
		case "UNDO_MATCH_REPORT": {
			const result = await SQMatchRepository.undoMatchReport({
				matchId,
				requestedByUserId: user.id,
				isStaff: user.roles.includes("STAFF"),
			});

			if (result.status === "NOT_ALLOWED") {
				return errorToast("Cannot undo report");
			}
			if (result.status === "ALREADY_LOCKED") {
				return null;
			}

			await refreshSendouQInstance();
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
			break;
		}
		case "REQUEST_CANCEL": {
			const unmappedMatch = notFoundIfFalsy(
				await SQMatchRepository.findById(matchId),
			);

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

			if (unmappedMatch.chatCode) {
				ChatSystemMessage.send({
					room: unmappedMatch.chatCode,
					type: "CANCEL_REPORTED",
					context: { name: user.username },
				});
			}

			await refreshSendouQInstance();
			break;
		}
		case "ACCEPT_CANCEL": {
			const unmappedMatch = notFoundIfFalsy(
				await SQMatchRepository.findById(matchId),
			);

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

			if (unmappedMatch.chatCode) {
				ChatSystemMessage.send({
					room: unmappedMatch.chatCode,
					type: "CANCEL_CONFIRMED",
					context: { name: user.username },
				});
			}

			await refreshSendouQInstance();
			break;
		}
		case "ADMIN_CANCEL": {
			errorToastIfFalsy(
				user.roles.includes("STAFF"),
				"Only mods can admin cancel",
			);

			const match = notFoundIfFalsy(await SQMatchRepository.findById(matchId));

			const result = await SQMatchRepository.cancelMatch({
				matchId,
				reportedByUserId: user.id,
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
			const unmappedMatch = notFoundIfFalsy(
				await SQMatchRepository.findById(matchId),
			);

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

			if (unmappedMatch.chatCode) {
				ChatSystemMessage.send({
					room: unmappedMatch.chatCode,
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

	return null;
};
