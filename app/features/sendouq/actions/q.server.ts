import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import * as AdminRepository from "~/features/admin/AdminRepository.server";
import { requireUser } from "~/features/auth/core/user.server";
import { refreshBannedCache } from "~/features/ban/core/banned.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import {
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PREPARING_PAGE,
	SUSPENDED_PAGE,
} from "~/utils/urls";
import { refreshSendouQInstance, SendouQ } from "../core/SendouQ.server";
import {
	JOIN_CODE_SEARCH_PARAM_KEY,
	SENDOUQ_LOOKING_ROOM,
	sqGroupWebsocketRoom,
} from "../q-constants";
import { frontPageSchema } from "../q-schemas.server";
import { userCanJoinQueueAt } from "../q-utils";
import {
	SendouQError,
	setGroupChatMetadata,
	sqRedirectIfNeeded,
} from "../q-utils.server";

export const action: ActionFunction = async ({ request, url }) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: frontPageSchema,
	});

	try {
		switch (data._action) {
			case "JOIN_QUEUE": {
				sqRedirectIfNeeded({
					ownGroup: SendouQ.findOwnGroup(user.id),
					currentLocation: "default",
				});

				await validateCanJoinQ(user);

				const { chatCodeToRevalidate } = await SQGroupRepository.createGroup({
					status: data.direct === "true" ? "ACTIVE" : "PREPARING",
					userId: user.id,
				});

				if (chatCodeToRevalidate) {
					ChatSystemMessage.send({
						room: chatCodeToRevalidate,
						revalidateOnly: true,
						authorUserId: user.id,
					});
				}

				await refreshSendouQInstance();

				// Joining directly creates an ACTIVE group that enters the pool, so
				// refresh every looking client. (A PREPARING group isn't in the pool.)
				if (data.direct === "true") {
					ChatSystemMessage.send({
						room: SENDOUQ_LOOKING_ROOM,
						revalidateOnly: true,
						authorUserId: user.id,
					});
				}

				return redirect(
					data.direct === "true"
						? SENDOUQ_LOOKING_PAGE
						: SENDOUQ_PREPARING_PAGE,
				);
			}
			case "JOIN_TEAM": {
				await validateCanJoinQ(user);

				const code = url.searchParams.get(JOIN_CODE_SEARCH_PARAM_KEY);

				const groupInvitedTo =
					code && user ? SendouQ.findGroupByInviteCode(code) : undefined;
				errorToastIfFalsy(
					groupInvitedTo,
					"Invite code doesn't match any active team",
				);

				const { chatCodeToRevalidate } = await SQGroupRepository.addMember(
					groupInvitedTo.id,
					{
						userId: user.id,
						role: "MANAGER",
					},
				);

				if (chatCodeToRevalidate) {
					ChatSystemMessage.send({
						room: chatCodeToRevalidate,
						revalidateOnly: true,
						authorUserId: user.id,
					});
				}

				await refreshSendouQInstance();

				const joinedGroup = SendouQ.findOwnGroup(user.id);
				if (joinedGroup?.chatCode) {
					setGroupChatMetadata({
						chatCode: joinedGroup.chatCode,
						members: joinedGroup.members,
					});
				}

				if (groupInvitedTo.status === "PREPARING") {
					// A preparing group isn't in the pool, so notify just its existing
					// members (on the preparing page) via the group topic.
					ChatSystemMessage.send({
						room: sqGroupWebsocketRoom(groupInvitedTo.id),
						revalidateOnly: true,
						authorUserId: user.id,
					});
				} else {
					// Joining an active group changes its size/suitability for the whole
					// pool, so refresh every looking client — which already includes the
					// group's own existing members.
					ChatSystemMessage.send({
						room: SENDOUQ_LOOKING_ROOM,
						revalidateOnly: true,
						authorUserId: user.id,
					});
				}

				return redirect(
					groupInvitedTo.status === "PREPARING"
						? SENDOUQ_PREPARING_PAGE
						: SENDOUQ_LOOKING_PAGE,
				);
			}
			case "ADD_FRIEND_CODE": {
				errorToastIfFalsy(
					!(await UserRepository.currentFriendCodeByUserId(user.id)),
					"Friend code already set",
				);

				const isTakenFriendCode = (
					await UserRepository.allCurrentFriendCodes()
				).has(data.friendCode);

				await UserRepository.insertFriendCode({
					userId: user.id,
					friendCode: data.friendCode,
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
		// some errors are expected to happen, for example two requests racing to
		// create/join a group. return null so loaders re-run and the user sees
		// the fresh state instead of an error page
		if (error instanceof SendouQError) {
			return null;
		}

		throw error;
	}
};

async function validateCanJoinQ(user: { id: number; discordId: string }) {
	const friendCode = await UserRepository.currentFriendCodeByUserId(user.id);
	errorToastIfFalsy(friendCode, "No friend code");
	const canJoinQueue = userCanJoinQueueAt(user, friendCode) === "NOW";

	errorToastIfFalsy(Seasons.current(), "Season is not active");
	errorToastIfFalsy(canJoinQueue, "Can't join queue right now");
}
