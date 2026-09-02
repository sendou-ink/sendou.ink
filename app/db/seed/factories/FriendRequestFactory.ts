import * as FriendRepository from "~/features/friends/FriendRepository.server";
import { defineFactory } from "../core/defineFactory";

/** Pending requests from `senderId` to `receiverId`. An accepted one is a friendship, see `FriendshipFactory`. */
export const { create, createMany } = defineFactory({
	defaults: () => ({}),
	insert: FriendRepository.insertFriendRequest,
});
