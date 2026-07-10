import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as FriendRepository from "~/features/friends/FriendRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import type { UserCardFriendship } from "../user-card-types";

export type UserCardFriendshipLoaderData = SerializeFrom<typeof loader>;

/**
 * Viewer-relative friendship data for a single user, lazy-loaded by the `UserCard`
 * popover when it opens (keeps `isFriend` + `mutualFriends` out of the batched card
 * query). Resolves to empty values when there is no logged-in viewer. Mutual friends
 * are only resolved when the card opts in via the `mutuals=true` query param (some
 * views, e.g. match pages, don't surface them), so the extra query is otherwise skipped.
 */
export const loader = async ({
	params,
	request,
}: LoaderFunctionArgs): Promise<UserCardFriendship> => {
	const viewer = getUser();
	const targetUserId = Number(params.id);

	if (!viewer || Number.isNaN(targetUserId)) {
		return {
			isFriend: false,
			sentFriendRequest: false,
			incomingFriendRequestId: null,
			mutualFriends: [],
		};
	}

	const withMutualFriends =
		new URL(request.url).searchParams.get("mutuals") === "true";

	const [friendship, pendingRequest, mutualFriends] = await Promise.all([
		FriendRepository.findFriendship({
			userOneId: viewer.id,
			userTwoId: targetUserId,
		}),
		FriendRepository.findFriendRequestBetween({
			senderId: viewer.id,
			receiverId: targetUserId,
		}),
		withMutualFriends
			? FriendRepository.findMutualFriends({
					loggedInUserId: viewer.id,
					targetUserId,
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
};
