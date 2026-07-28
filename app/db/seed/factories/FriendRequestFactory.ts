import * as FriendRepository from "~/features/friends/FriendRepository.server";
import { defineFactory } from "../core/defineFactory";

/**
 * Creates pending friend requests: `senderId` has asked `receiverId` to be friends.
 * A request that was accepted is a friendship instead, see `FriendshipFactory`.
 */
export const { create, createMany } = defineFactory({
	defaults: () => ({}),
	insert: FriendRepository.insertFriendRequest,
});
