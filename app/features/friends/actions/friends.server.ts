import type { ActionFunction } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
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
	}

	return null;
};
