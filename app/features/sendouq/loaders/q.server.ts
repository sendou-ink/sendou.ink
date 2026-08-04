import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { SendouQ } from "../core/SendouQ.server";
import { qSearchParams } from "../q-search-params";
import { sqRedirectIfNeeded } from "../q-utils.server";

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const user = getUser();

	const { join: code } = qSearchParams.parse(url);

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
			? await UserRepository.findCurrentFriendCodeByUserId(user.id)
			: undefined,
	};
};
