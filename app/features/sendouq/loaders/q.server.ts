import type { LoaderFunctionArgs } from "@remix-run/node";
import { getUserId } from "~/features/auth/core/user.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { SQManager } from "../core/SQManager.server";
import { JOIN_CODE_SEARCH_PARAM_KEY } from "../q-constants";
import { sqRedirectIfNeeded } from "../q-utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUserId(request);

	const code = new URL(request.url).searchParams.get(
		JOIN_CODE_SEARCH_PARAM_KEY,
	);

	const ownGroup = user ? SQManager.findOwnGroup(user.id) : undefined;

	sqRedirectIfNeeded({
		ownGroup,
		currentLocation: "default",
	});

	const groupInvitedTo =
		code && user ? SQManager.findGroupByInviteCode(code) : undefined;

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
