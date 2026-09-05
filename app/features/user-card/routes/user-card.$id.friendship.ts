import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as FriendRepository from "~/features/friends/FriendRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { userCardFriendshipSearchParams } from "../user-card-search-params";
import type { UserCardFriendship } from "../user-card-types";

export type UserCardFriendshipLoaderData = SerializeFrom<typeof loader>;

/**
 * Viewer-relative friendship data, lazy-loaded when a `UserCard` opens. Empty without a logged-in
 * viewer; mutual friends only with the `mutuals=true` param, skipping that query otherwise.
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

	const { mutuals: withMutualFriends } =
		userCardFriendshipSearchParams.parse(request);

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
