import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { getUserId } from "~/features/auth/core/user.server";
import { currentSeason, nextSeason } from "~/features/mmr/season";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { JOIN_CODE_SEARCH_PARAM_KEY } from "../q-constants";
import { groupRedirectLocationByCurrentLocation } from "../q-utils";
import { findCurrentGroupByUserId } from "../queries/findCurrentGroupByUserId.server";
import { findGroupByInviteCode } from "../queries/findGroupByInviteCode.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUserId(request);

	const code = new URL(request.url).searchParams.get(
		JOIN_CODE_SEARCH_PARAM_KEY,
	);

	const redirectLocation = groupRedirectLocationByCurrentLocation({
		group: user ? findCurrentGroupByUserId(user.id) : undefined,
		currentLocation: "default",
	});

	if (redirectLocation) {
		throw redirect(`${redirectLocation}${code ? "?joining=true" : ""}`);
	}

	const groupInvitedTo = code && user ? findGroupByInviteCode(code) : undefined;

	const now = new Date();
	const season = currentSeason(now);
	const upcomingSeason = !season ? nextSeason(now) : undefined;

	return {
		season,
		upcomingSeason,
		groupInvitedTo,
		friendCode: user
			? await UserRepository.currentFriendCodeByUserId(user.id)
			: undefined,
	};
};
