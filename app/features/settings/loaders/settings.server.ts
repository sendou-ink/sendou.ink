import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";

export const loader = async (_args: LoaderFunctionArgs) => {
	const user = getUser();

	if (!user) {
		return { matchProfile: null };
	}

	const matchProfile = await MatchProfileRepository.findSettingsByUserId(
		user.id,
	);

	return { matchProfile };
};
