import * as v from "valibot";
import { getUser } from "#lib/features/auth/user.server.ts";
import * as FriendRepository from "#lib/features/friends/FriendRepository.server.ts";
import { id } from "#lib/utils/schemas.ts";
import { query } from "$app/server";
import type { UserCardFriendship } from "./user-card-types.ts";

/**
 * Viewer-relative friendship data for a single user, lazy-loaded by the `UserCard`
 * popover when it opens (keeps `isFriend` + `mutualFriends` out of the batched card
 * query). Resolves to empty values when there is no logged-in viewer. Mutual friends
 * are only resolved when the card opts in via `withMutualFriends` (some views, e.g.
 * match pages, don't surface them), so the extra query is otherwise skipped.
 */
export const getUserCardFriendship = query(
	v.object({ userId: id, withMutualFriends: v.boolean() }),
	async ({ userId, withMutualFriends }): Promise<UserCardFriendship> => {
		const viewer = getUser();

		if (!viewer) {
			return {
				isFriend: false,
				sentFriendRequest: false,
				incomingFriendRequestId: null,
				mutualFriends: [],
			};
		}

		const [friendship, pendingRequest, mutualFriends] = await Promise.all([
			FriendRepository.findFriendship({
				userOneId: viewer.id,
				userTwoId: userId,
			}),
			FriendRepository.findFriendRequestBetween({
				senderId: viewer.id,
				receiverId: userId,
			}),
			withMutualFriends
				? FriendRepository.findMutualFriends({
						loggedInUserId: viewer.id,
						targetUserId: userId,
					})
				: [],
		]);

		return {
			isFriend: Boolean(friendship),
			sentFriendRequest: pendingRequest?.senderId === viewer.id,
			incomingFriendRequestId:
				pendingRequest && pendingRequest.senderId !== viewer.id
					? pendingRequest.id
					: null,
			mutualFriends,
		};
	},
);
