import type { ActionFunction } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { notify } from "~/features/notifications/core/notify.server";
import { parseFormData } from "~/form/parse.server";
import * as FriendRepository from "../FriendRepository.server";
import { friendsActionSchema } from "../friends-schemas.server";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();

	const result = await parseFormData({
		request,
		schema: friendsActionSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	switch (result.data._action) {
		case "SEND_REQUEST": {
			await FriendRepository.insertFriendRequest({
				senderId: user.id,
				receiverId: result.data.userId,
			});

			await notify({
				userIds: [result.data.userId],
				notification: {
					type: "FRIEND_REQUEST_RECEIVED",
					meta: { senderUsername: user.username },
				},
			});

			break;
		}
		case "CANCEL_REQUEST": {
			await FriendRepository.deleteFriendRequest({
				id: result.data.friendRequestId,
				senderId: user.id,
			});

			break;
		}
		case "DELETE_FRIEND": {
			await FriendRepository.deleteFriendship({
				id: result.data.friendshipId,
				userId: user.id,
			});

			break;
		}
		case "ACCEPT_REQUEST": {
			const friendRequest =
				await FriendRepository.findFriendRequestByIdAndReceiver({
					id: result.data.friendRequestId,
					receiverId: user.id,
				});
			if (!friendRequest) break;

			await FriendRepository.insertFriendship({
				userOneId: user.id,
				userTwoId: friendRequest.senderId,
				friendRequestId: result.data.friendRequestId,
			});

			break;
		}
		case "DECLINE_REQUEST": {
			await FriendRepository.deleteFriendRequestByReceiver({
				id: result.data.friendRequestId,
				receiverId: user.id,
			});

			break;
		}
	}

	return null;
};
