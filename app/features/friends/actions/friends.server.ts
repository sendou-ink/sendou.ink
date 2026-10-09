import { requireUser } from "~/features/auth/core/user.server";
import { notify } from "~/features/notifications/core/notify.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import { defineAction } from "~/form/define-action.server";
import { errorToastIfFalsy } from "~/utils/remix.server";
import * as FriendRepository from "../FriendRepository.server";
import { FRIEND } from "../friends-constants";
import { friendsActionSchema } from "../friends-schemas.server";

export const action = defineAction(
	{ body: friendsActionSchema },
	async ({ body }) => {
		const user = requireUser();

		switch (body._action) {
			case "SEND_REQUEST": {
				const pendingCount = await FriendRepository.countPendingSentRequests(
					user.id,
				);
				errorToastIfFalsy(
					pendingCount < FRIEND.MAX_PENDING_REQUESTS,
					"Maximum pending friend requests reached",
				);

				await FriendRepository.insertFriendRequest({
					senderId: user.id,
					receiverId: body.userId,
				});

				await notify({
					userIds: [body.userId],
					notification: {
						type: "FRIEND_REQUEST_RECEIVED",
						meta: { senderId: user.id, senderUsername: user.username },
					},
				});

				break;
			}
			case "CANCEL_REQUEST": {
				const deleted = await FriendRepository.deleteFriendRequest({
					id: body.friendRequestId,
					senderId: user.id,
				});

				if (deleted) {
					// the receiver no longer has a request to respond to
					await resolveNotifications({
						userIds: [deleted.receiverId],
						type: "FRIEND_REQUEST_RECEIVED",
						meta: { senderId: user.id },
					});
				}

				break;
			}
			case "DELETE_FRIEND": {
				await FriendRepository.deleteOwnFriendshipById(body.friendshipId);

				break;
			}
			case "PIN_FRIEND": {
				await FriendRepository.updateOwnFriendshipPinned({
					friendshipId: body.friendshipId,
					isPinned: true,
				});

				break;
			}
			case "UNPIN_FRIEND": {
				await FriendRepository.updateOwnFriendshipPinned({
					friendshipId: body.friendshipId,
					isPinned: false,
				});

				break;
			}
			case "ACCEPT_REQUEST": {
				const friendRequest =
					await FriendRepository.findFriendRequestByIdAndReceiver({
						id: body.friendRequestId,
						receiverId: user.id,
					});
				if (!friendRequest) break;

				await FriendRepository.insertFriendship({
					userOneId: user.id,
					userTwoId: friendRequest.senderId,
					friendRequestId: body.friendRequestId,
				});

				await resolveNotifications({
					userIds: [user.id],
					type: "FRIEND_REQUEST_RECEIVED",
					meta: { senderId: friendRequest.senderId },
				});

				break;
			}
			case "DECLINE_REQUEST": {
				const friendRequest =
					await FriendRepository.findFriendRequestByIdAndReceiver({
						id: body.friendRequestId,
						receiverId: user.id,
					});
				if (!friendRequest) break;

				await FriendRepository.deleteFriendRequestByReceiver({
					id: body.friendRequestId,
					receiverId: user.id,
				});

				await resolveNotifications({
					userIds: [user.id],
					type: "FRIEND_REQUEST_RECEIVED",
					meta: { senderId: friendRequest.senderId },
				});

				break;
			}
		}

		return null;
	},
);
