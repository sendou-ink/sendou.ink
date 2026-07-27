import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as FriendRepository from "~/features/friends/FriendRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish } from "~/utils/remix.server";

export type UserPageLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const loggedInUser = getUser();

	const user = notFoundIfNullish(
		await UserRepository.findLayoutDataByIdentifier(
			params.identifier!,
			loggedInUser?.id,
		),
	);

	const widgetsEnabled = await UserRepository.findEnabledWidgetsByIdentifier(
		params.identifier!,
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
		type: widgetsEnabled ? ("new" as const) : ("old" as const),
		mutualFriends,
	};
};
