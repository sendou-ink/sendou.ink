import * as v from "valibot";
import { stringConstant, userSearch } from "~/form/fields";
import { _action, id } from "~/utils/schema";

export const sendFriendRequestBaseSchema = v.object({
	_action: stringConstant("SEND_REQUEST"),
	userId: userSearch({ label: "labels.friendUser" }),
});

export const cancelFriendRequestSchema = v.object({
	_action: _action("CANCEL_REQUEST"),
	friendRequestId: id,
});

export const deleteFriendSchema = v.object({
	_action: _action("DELETE_FRIEND"),
	friendshipId: id,
});

export const acceptFriendRequestSchema = v.object({
	_action: _action("ACCEPT_REQUEST"),
	friendRequestId: id,
});

export const declineFriendRequestSchema = v.object({
	_action: _action("DECLINE_REQUEST"),
	friendRequestId: id,
});
