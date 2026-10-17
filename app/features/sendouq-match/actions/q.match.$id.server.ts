import * as R from "remeda";
import type * as v from "valibot";
import { db } from "~/db/sql";
import {
	type AuthenticatedUser,
	requireUser,
} from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { chatRoomChannel } from "~/features/events/events-types";
import * as Seasons from "~/features/mmr/core/Seasons";
import { refreshUserSkills } from "~/features/mmr/tiered.server";
import { linkStoredMatches } from "~/features/scanner-ingest/core/relink.server";
import * as GroupMatchContinueVoteRepository from "~/features/sendouq-match/GroupMatchContinueVoteRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { refreshStreamsCache } from "~/features/sendouq-streams/core/streams.server";
import {
	refreshSendouQInstance,
	SendouQ,
} from "~/features/sendouq/core/SendouQ.server";
import { SENDOUQ_LOOKING_CHANNEL } from "~/features/sendouq/q-constants";
import { SendouQError } from "~/features/sendouq/q-utils.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { defineAction } from "~/form/define-action.server";
import { logger } from "~/utils/logger";
import {
	errorToast,
	errorToastIfFalsy,
	notFoundIfNullish,
} from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import { assertUnreachable } from "~/utils/types";
import { sendMatchCanceledWebhook } from "../core/discord-webhook.server";
import * as RejoinVote from "../core/RejoinVote";
import * as SendouQMatch from "../core/SendouQMatch";
import { matchSchema } from "../q-match-schemas";

type MatchActionBody = v.InferOutput<typeof matchSchema>;
type MatchActionBodyOf<Action extends MatchActionBody["_action"]> = Extract<
	MatchActionBody,
	{ _action: Action }
>;

interface MatchActionContext {
	user: AuthenticatedUser;
	match: MatchById;
	matchId: number;
	isStaff: boolean;
	isParticipant: boolean;
}

export const action = defineAction(
	{ params: idObject, body: matchSchema },
	async ({ params: { id: matchId }, body }) => {
		const user = requireUser();

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
			return await runMatchAction(
				{ user, match, matchId, isStaff, isParticipant },
				body,
			);
		} catch (error) {
			// expected errors (two requests racing to create/join a group): return null so
			// loaders re-run and the user sees the fresh state instead of an error page
			if (error instanceof SendouQError) {
				return null;
			}

			throw error;
		}
	},
);

type MatchById = NonNullable<
	Awaited<ReturnType<typeof SQMatchRepository.findById>>
>;

function runMatchAction(ctx: MatchActionContext, body: MatchActionBody) {
	switch (body._action) {
		case "REPORT_SCORE":
			return reportScore(ctx, body);
		case "DISPUTE_SCORE":
			return disputeScore(ctx);
		case "LOOK_AGAIN":
			return lookAgain(ctx, body);
		case "CAST_CONTINUE_VOTE":
			return castContinueVote(ctx, body);
		case "REPORT_WEAPON":
			return reportWeapon(ctx, body);
		case "UNDO_WEAPON_REPORT":
			return undoWeaponReport(ctx, body);
		case "UNDO_MATCH_REPORT":
			return undoMatchReport(ctx);
		case "UNDO_MAP_REPORT":
			return undoMapReport(ctx, body);
		case "REQUEST_CANCEL":
			return requestCancel(ctx, body);
		case "ACCEPT_CANCEL":
			return acceptCancel(ctx, body);
		case "ADMIN_CANCEL":
			return adminCancel(ctx);
		case "REFUSE_CANCEL":
			return refuseCancel(ctx);
		default: {
			assertUnreachable(body);
		}
	}
}

async function reportScore(
	{ user, match, matchId, isStaff, isParticipant }: MatchActionContext,
	body: MatchActionBodyOf<"REPORT_SCORE">,
) {
	const isStaffReport = !isParticipant && isStaff;

	const result = await SQMatchRepository.reportMapWinner({
		matchId,
		winnerId: body.winnerId,
		reportedByUserId: user.id,
		reportedCount: body.reportedCount,
		confirmingReportedAt: body.confirmingReportedAt,
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

	await linkStoredMatches({ type: "sendouq", groupMatchId: matchId });

	if (result.status === "MATCH_FINALIZED") {
		await refreshSkillsAndStreams();
	}

	await refreshSendouQInstance();

	notifyMatchStatusChanged(match);

	if (match.chatRoomId) {
		if (result.status === "MATCH_FINALIZED") {
			void ChatSystemMessage.sendPersisted({
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

	return null;
}

async function disputeScore({ user, match }: MatchActionContext) {
	errorToastIfFalsy(!match.isLocked, "Match is already locked");
	errorToastIfFalsy(
		SendouQMatch.score(match).isDecisive,
		"No reported score to dispute",
	);

	const decidingMap = match.mapList
		.toReversed()
		.find((m) => m.winnerGroupId !== null);
	const reporterSide = SendouQMatch.resolveGroupMemberOf({
		groupAlpha: match.groupAlpha,
		groupBravo: match.groupBravo,
		userId: decidingMap?.reportedByUserId,
	});
	const disputerSide = SendouQMatch.resolveGroupMemberOf({
		groupAlpha: match.groupAlpha,
		groupBravo: match.groupBravo,
		userId: user.id,
	});
	errorToastIfFalsy(
		disputerSide !== null && disputerSide !== reporterSide,
		"Only the team asked to confirm can dispute the score",
	);

	if (match.chatRoomId) {
		void ChatSystemMessage.sendPersisted({
			roomId: match.chatRoomId,
			type: "SCORE_DISPUTED",
			authorUserId: user.id,
		});
	}

	return null;
}

async function lookAgain(
	{ user, match }: MatchActionContext,
	body: MatchActionBodyOf<"LOOK_AGAIN">,
) {
	const season = Seasons.current();
	errorToastIfFalsy(season, "Season is not active");

	const previousGroup =
		match.groupAlpha.id === body.previousGroupId
			? match.groupAlpha
			: match.groupBravo.id === body.previousGroupId
				? match.groupBravo
				: null;
	errorToastIfFalsy(previousGroup, "Previous group not found in this match");

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
		previousGroupId: body.previousGroupId,
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

	ChatSystemMessage.notifyStatusChanged(previousGroup.members.map((m) => m.id));

	return null;
}

async function castContinueVote(
	{ user, match }: MatchActionContext,
	body: MatchActionBodyOf<"CAST_CONTINUE_VOTE">,
) {
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

		if (!RejoinVote.canCastVote(existingVotes, user.id, body.isContinuing)) {
			return null;
		}

		await GroupMatchContinueVoteRepository.castOwnVote(
			{
				groupId: viewerGroup.id,
				isContinuing: body.isContinuing,
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
		ChatSystemMessage.notifyStatusChanged(
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

	return null;
}

async function reportWeapon(
	{ match, matchId }: MatchActionContext,
	body: MatchActionBodyOf<"REPORT_WEAPON">,
) {
	errorToastIfFalsy(!match.isCanceled, "Match was canceled");

	await ReportedWeaponRepository.upsertOwn({
		groupMatchId: matchId,
		mapIndex: body.mapIndex,
		weaponSplId: body.weaponSplId,
	});

	return null;
}

async function undoWeaponReport(
	{ matchId }: MatchActionContext,
	body: MatchActionBodyOf<"UNDO_WEAPON_REPORT">,
) {
	await ReportedWeaponRepository.deleteOwnByMapIndex({
		matchId,
		mapIndex: body.mapIndex,
	});

	return null;
}

async function undoMatchReport({
	user,
	match,
	matchId,
	isStaff,
}: MatchActionContext) {
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

	notifyMatchStatusChanged(match);

	if (match.chatRoomId) {
		ChatSystemMessage.send({
			channel: chatRoomChannel(match.chatRoomId),
		});
	}

	return null;
}

async function undoMapReport(
	{ match, matchId }: MatchActionContext,
	body: MatchActionBodyOf<"UNDO_MAP_REPORT">,
) {
	const result = await SQMatchRepository.undoMapReport({
		matchId,
		mapIndex: body.mapIndex,
	});

	if (result.status === "NOT_ALLOWED") {
		return errorToast("Cannot undo map report");
	}
	if (result.status === "ALREADY_LOCKED") {
		return null;
	}

	await refreshSendouQInstance();

	notifyMatchStatusChanged(match);

	if (match.chatRoomId) {
		ChatSystemMessage.send({
			channel: chatRoomChannel(match.chatRoomId),
		});
	}

	return null;
}

async function requestCancel(
	{ user, match, matchId }: MatchActionContext,
	body: MatchActionBodyOf<"REQUEST_CANCEL">,
) {
	const result = await SQMatchRepository.requestCancelMatch({
		matchId,
		requestedByUserId: user.id,
		reason: body.reason,
		nominatedUserIds: parseNominatedUserIds(body.nominatedUserIds, match),
	});

	if (result.status === "ALREADY_LOCKED") {
		return null;
	}
	if (result.status === "ALREADY_REQUESTED") {
		return null;
	}

	if (match.chatRoomId) {
		void ChatSystemMessage.sendPersisted({
			roomId: match.chatRoomId,
			type: "CANCEL_REPORTED",
			authorUserId: user.id,
		});
	}

	await refreshSendouQInstance();

	return null;
}

async function acceptCancel(
	{ user, match, matchId }: MatchActionContext,
	body: MatchActionBodyOf<"ACCEPT_CANCEL">,
) {
	const result = await SQMatchRepository.acceptCancelMatch({
		matchId,
		acceptedByUserId: user.id,
		reason: body.reason,
		nominatedUserIds: parseNominatedUserIds(body.nominatedUserIds, match),
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
		void ChatSystemMessage.sendPersisted({
			roomId: match.chatRoomId,
			type: "CANCEL_CONFIRMED",
			authorUserId: user.id,
		});
	}

	await refreshSendouQInstance();

	notifyMatchStatusChanged(match);

	return null;
}

async function adminCancel({ match, matchId, isStaff }: MatchActionContext) {
	errorToastIfFalsy(isStaff, "Only mods can admin cancel");

	const result = await SQMatchRepository.cancelMatch({
		matchId,
		isAdminReport: true,
	});

	if (result.shouldRefreshCaches) {
		await refreshSkillsAndStreams();
	}

	await refreshSendouQInstance();

	notifyMatchStatusChanged(match);

	if (match.chatRoomId) {
		ChatSystemMessage.send({
			channel: chatRoomChannel(match.chatRoomId),
		});
		// no system message accompanies a staff cancel, so the rooms it
		// just made inactive are announced on their own
		void ChatSystemMessage.notifyRoomsChangedByRoomIds([match.chatRoomId]);
	}

	return null;
}

async function refuseCancel({ user, match, matchId }: MatchActionContext) {
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
		void ChatSystemMessage.sendPersisted({
			roomId: match.chatRoomId,
			type: "CANCEL_REFUSED",
			authorUserId: user.id,
		});
	}

	await refreshSendouQInstance();

	return null;
}

function notifyMatchStatusChanged(match: MatchById) {
	ChatSystemMessage.notifyStatusChanged(
		SendouQMatch.allMembers(match).map((m) => m.id),
	);
}

async function refreshSkillsAndStreams() {
	try {
		await refreshUserSkills(Seasons.currentOrPrevious()!.nth);
	} catch (error) {
		logger.warn("Error refreshing user skills", error);
	}
	refreshStreamsCache();
}

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
