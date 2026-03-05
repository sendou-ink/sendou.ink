import { z } from "zod";
import { stringConstant, userSearch } from "~/form/fields";
import { _action, id } from "~/utils/zod";

export const sendFriendRequestBaseSchema = z.object({
	_action: stringConstant("SEND_REQUEST"),
	userId: userSearch({ label: "labels.friendUser" }),
});

export const cancelFriendRequestSchema = z.object({
	_action: _action("CANCEL_REQUEST"),
	friendRequestId: id,
});

export const deleteFriendSchema = z.object({
	_action: _action("DELETE_FRIEND"),
	friendshipId: id,
});
