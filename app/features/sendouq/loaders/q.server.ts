import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { SendouQ, sqRedirectIfNeeded } from "../core/SendouQ.server";
import { qSearchParams } from "../q-search-params";
import { userCanJoinQueueAt } from "../q-utils";

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const user = getUser();

	const { join: code } = qSearchParams.parse(url);

	const ownGroup = user ? SendouQ.findOwnGroup(user.id) : undefined;

	await sqRedirectIfNeeded({
		ownGroup,
		currentLocation: "default",
	});

	const groupInvitedTo =
		code && user ? SendouQ.findGroupByInviteCode(code) : undefined;

	const season = Seasons.current();
	const upcomingSeason = !season ? Seasons.next() : undefined;

	const friendCode = user
		? await UserRepository.findCurrentFriendCodeByUserId(user.id)
		: undefined;

	return {
		season: season ? seasonWithTimestamps(season) : undefined,
		upcomingSeason: upcomingSeason
			? seasonWithTimestamps(upcomingSeason)
			: undefined,
		groupInvitedTo,
		friendCode,
		queueJoinStatus:
			user && friendCode ? userCanJoinQueueAt(user, friendCode) : null,
	};
};

function seasonWithTimestamps(season: Seasons.ListItem) {
	return {
		...season,
		starts: season.starts.getTime(),
		ends: season.ends.getTime(),
	};
}
