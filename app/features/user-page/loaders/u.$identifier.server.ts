import { type LoaderFunctionArgs, redirect } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as FriendRepository from "~/features/friends/FriendRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { userPageUser } from "~/features/user-page/user-page-context.server";
import { userPageRedirectPath } from "~/features/user-page/user-page-urls";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish } from "~/utils/remix.server";

export type UserPageLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const loggedInUser = getUser();
	const pageUser = userPageUser();

	const redirectPath = userPageRedirectPath(url, pageUser);
	if (redirectPath) {
		throw redirect(redirectPath);
	}

	const user = notFoundIfNullish(
		await UserRepository.findLayoutDataById(pageUser.id, loggedInUser?.id),
	);

	const mutualFriends =
		loggedInUser && loggedInUser.id !== user.id
			? await FriendRepository.findMutualFriends({
					loggedInUserId: loggedInUser.id,
					targetUserId: user.id,
				})
			: [];

	return {
		user,
		customTheme: user.customTheme,
		mutualFriends,
	};
};
