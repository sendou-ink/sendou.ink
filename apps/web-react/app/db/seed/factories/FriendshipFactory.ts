import * as FriendRepository from "~/features/friends/FriendRepository.server";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Omit<
	Parameters<typeof FriendRepository.insertFriendship>[0],
	"friendRequestId"
>;

/**
 * Creates friendships between `userOneId` and `userTwoId`, in the order production
 * makes them: the request one sent the other is created first and consumed by the
 * friendship. Which of the two is stored as the first user is the repository's own.
 */
export const { create } = defineFactory({
	defaults: () => ({}),
	insert: async ({ userOneId, userTwoId }: InsertArgs) => {
		const request = await FriendRepository.insertFriendRequest({
			senderId: userOneId,
			receiverId: userTwoId,
		});

		return FriendRepository.insertFriendship({
			userOneId,
			userTwoId,
			friendRequestId: request.id,
		});
	},
});
