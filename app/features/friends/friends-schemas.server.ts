import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import * as FriendRepository from "./FriendRepository.server";
import {
	acceptFriendRequestSchema,
	cancelFriendRequestSchema,
	declineFriendRequestSchema,
	deleteFriendSchema,
	sendFriendRequestBaseSchema,
} from "./friends-schemas";

export const sendFriendRequestSchemaServer =
	sendFriendRequestBaseSchema.superRefine(async (data, ctx) => {
		const user = requireUser();

		if (data.userId === user.id) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
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
				code: z.ZodIssueCode.custom,
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
				code: z.ZodIssueCode.custom,
				message: "forms:errors.friendRequestExists",
				path: ["userId"],
			});
		}
	});

export const friendsActionSchema = z.union([
	sendFriendRequestSchemaServer,
	cancelFriendRequestSchema,
	deleteFriendSchema,
	acceptFriendRequestSchema,
	declineFriendRequestSchema,
]);
