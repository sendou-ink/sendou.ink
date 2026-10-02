import { type LoaderFunctionArgs, redirect } from "react-router";
import { refine } from "~/db/entity-query";
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
		await layoutUser(pageUser.id).executeTakeFirst(),
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

function layoutUser(userId: number) {
	return UserRepository.users()
		.where({ id: userId })
		.withPlusTier()
		.withCountry()
		.withPatronTheme()
		.withTabCounts()
		// xxx: could we somehow have an API that just lets you select more fields, preferably only giving those as option that are not part of the default select?
		.with(
			refine("User", (qb) =>
				qb.select([
					"User.pronouns",
					"User.inGameName",
					"User.commissionText",
					"User.commissionsOpen",
				]),
			),
		);
}
