import * as FriendRepository from "~/features/friends/FriendRepository.server";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Omit<
	Parameters<typeof FriendRepository.insertFriendship>[0],
	"friendRequestId"
>;

/** Like production: a request is created first and consumed by the friendship. Stored order is the repository's own. */
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
