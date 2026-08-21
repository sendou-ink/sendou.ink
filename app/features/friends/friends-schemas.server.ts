import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import { superRefineAsync } from "~/utils/schema";
import * as FriendRepository from "./FriendRepository.server";
import {
	acceptFriendRequestSchema,
	cancelFriendRequestSchema,
	declineFriendRequestSchema,
	deleteFriendSchema,
	sendFriendRequestBaseSchema,
} from "./friends-schemas";

const sendFriendRequestSchemaServer = v.pipeAsync(
	sendFriendRequestBaseSchema,
	superRefineAsync(async (data, ctx) => {
		const user = requireUser();

		if (data.userId === user.id) {
			ctx.addIssue({
				message: "forms:errors.cannotFriendSelf",
				path: ["userId"],
			});
			return;
		}

		const existingFriendship = await FriendRepository.findFriendship({
			userOneId: user.id,
			userTwoId: data.userId,
		});
		if (existingFriendship) {
			ctx.addIssue({
				message: "forms:errors.alreadyFriends",
				path: ["userId"],
			});
			return;
		}

		const existingRequest = await FriendRepository.findFriendRequestBetween({
			senderId: user.id,
			receiverId: data.userId,
		});
		if (existingRequest) {
			ctx.addIssue({
				message: "forms:errors.friendRequestExists",
				path: ["userId"],
			});
		}
	}),
);

export const friendsActionSchema = v.unionAsync([
	sendFriendRequestSchemaServer,
	cancelFriendRequestSchema,
	deleteFriendSchema,
	acceptFriendRequestSchema,
	declineFriendRequestSchema,
]);
