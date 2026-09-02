import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import * as AdminRepository from "~/features/admin/AdminRepository.server";
import { requireUser } from "~/features/auth/core/user.server";
import { refreshBannedCache } from "~/features/ban/core/banned.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { chatRoomChannel } from "~/features/events/events-types";
import * as Seasons from "~/features/mmr/core/Seasons";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseFormData } from "~/form/parse.server";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { normalizeFriendCode } from "~/utils/schema";
import { assertUnreachable } from "~/utils/types";
import {
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PREPARING_PAGE,
	SUSPENDED_PAGE,
} from "~/utils/urls";
import {
	refreshSendouQInstance,
	SendouQ,
	sqRedirectIfNeeded,
} from "../core/SendouQ.server";
import { frontPageSchema } from "../q-action-schemas";
import { SENDOUQ_LOOKING_CHANNEL, sqGroupChannel } from "../q-constants";
import { qSearchParams } from "../q-search-params";
import { userCanJoinQueueAt } from "../q-utils";
import { SendouQError, seasonInitialSkillsExist } from "../q-utils.server";

export const action: ActionFunction = async ({ request, url }) => {
	const user = requireUser();
	const result = await parseFormData({
		request,
		schema: frontPageSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	try {
		switch (data._action) {
			case "JOIN_QUEUE": {
				await sqRedirectIfNeeded({
					ownGroup: SendouQ.findOwnGroup(user.id),
					currentLocation: "default",
				});

				await validateCanJoinQ(user);

				const { chatRoomIdToRevalidate } = await SQGroupRepository.insert({
					status: data.direct === "true" ? "ACTIVE" : "PREPARING",
					userId: user.id,
				});

				if (chatRoomIdToRevalidate) {
					ChatSystemMessage.send({
						channel: chatRoomChannel(chatRoomIdToRevalidate),
					});
				}

				await refreshSendouQInstance();

				// joining directly creates an ACTIVE group that enters the pool (a PREPARING one isn't in it)
				if (data.direct === "true") {
					ChatSystemMessage.send({ channel: SENDOUQ_LOOKING_CHANNEL });
				}

				return redirect(
					data.direct === "true"
						? SENDOUQ_LOOKING_PAGE
						: SENDOUQ_PREPARING_PAGE,
				);
			}
			case "JOIN_TEAM": {
				await validateCanJoinQ(user);

				const { join: code } = qSearchParams.parse(url);

				const groupInvitedTo =
					code && user ? SendouQ.findGroupByInviteCode(code) : undefined;
				errorToastIfFalsy(
					groupInvitedTo,
					"Invite code doesn't match any active team",
				);

				const { chatRoomIdToRevalidate } = await SQGroupRepository.insertMember(
					groupInvitedTo.id,
					{ userId: user.id },
				);

				if (chatRoomIdToRevalidate) {
					ChatSystemMessage.send({
						channel: chatRoomChannel(chatRoomIdToRevalidate),
					});
				}

				await refreshSendouQInstance();

				if (groupInvitedTo.status === "PREPARING") {
					// a preparing group isn't in the pool, so only its members (on the preparing page)
					ChatSystemMessage.send({
						channel: sqGroupChannel(groupInvitedTo.id),
					});
				} else {
					// the group's size/suitability changed for the whole pool, its own members included
					ChatSystemMessage.send({ channel: SENDOUQ_LOOKING_CHANNEL });
				}

				return redirect(
					groupInvitedTo.status === "PREPARING"
						? SENDOUQ_PREPARING_PAGE
						: SENDOUQ_LOOKING_PAGE,
				);
			}
			case "ADD_FRIEND_CODE": {
				errorToastIfFalsy(
					!(await UserRepository.findCurrentFriendCodeByUserId(user.id)),
					"Friend code already set",
				);

				const friendCode = normalizeFriendCode(data.friendCode);

				const isTakenFriendCode = (
					await UserRepository.findAllCurrentFriendCodes()
				).has(friendCode);

				await UserRepository.insertFriendCode({
					userId: user.id,
					friendCode,
					submitterUserId: user.id,
				});

				if (isTakenFriendCode) {
					await AdminRepository.banUser({
						userId: user.id,
						banned: 1,
						bannedReason:
							"[automatic ban] This friend code is already in use by some other account. Please contact staff on our Discord helpdesk for resolution including merging accounts.",
						bannedByUserId: null,
					});

					await refreshBannedCache();

					throw redirect(SUSPENDED_PAGE);
				}

				return null;
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
};

async function validateCanJoinQ(user: { id: number; discordId: string }) {
	const friendCode = await UserRepository.findCurrentFriendCodeByUserId(
		user.id,
	);
	errorToastIfFalsy(friendCode, "No friend code");
	const canJoinQueue = userCanJoinQueueAt(user, friendCode) === "NOW";

	const season = Seasons.current();
	errorToastIfFalsy(season, "Season is not active");
	errorToastIfFalsy(canJoinQueue, "Can't join queue right now");
	errorToastIfFalsy(
		await seasonInitialSkillsExist(season.nth),
		"Season's starting powers are not set yet. Please contact staff on the Discord helpdesk",
	);
}
