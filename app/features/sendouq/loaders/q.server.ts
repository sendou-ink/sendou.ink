import type { LoaderFunctionArgs } from "react-router";
import { getUserId } from "~/features/auth/core/user.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { SendouQ } from "../core/SendouQ.server";
import { JOIN_CODE_SEARCH_PARAM_KEY } from "../q-constants";
import { sqRedirectIfNeeded } from "../q-utils.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUserId(request);

	const code = new URL(request.url).searchParams.get(
		JOIN_CODE_SEARCH_PARAM_KEY,
	);

	const ownGroup = user ? SendouQ.findOwnGroup(user.id) : undefined;

	sqRedirectIfNeeded({
		ownGroup,
		currentLocation: "default",
	});

	const groupInvitedTo =
		code && user ? SendouQ.findGroupByInviteCode(code) : undefined;

	const season = Seasons.current();
	const upcomingSeason = !season ? Seasons.next() : undefined;

	return {
		season,
		upcomingSeason,
		groupInvitedTo,
		friendCode: user
			? await UserRepository.currentFriendCodeByUserId(user.id)
			: undefined,
	};
};
