import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import * as LFGRepository from "../LFGRepository.server";
import { lfgNewSearchParams } from "../lfg-search-params";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { postId } = lfgNewSearchParams.parse(request);

	const userProfileData = await UserRepository.findProfileByUserId(user.id);
	const userMatchProfile = await MatchProfileRepository.findSettingsByUserId(
		user.id,
	);
	const ownPosts = await LFGRepository.posts().ownedByActor().execute(); // xxx: why no findById? then checking perms
	const postToEdit = ownPosts.find((post) => post.id === postId);

	return {
		team: userProfileData?.team,
		weaponPool: userMatchProfile.weaponPool,
		languages: postToEdit?.languages ?? userMatchProfile.languages,
		postToEdit,
		userPostTypes: ownPosts.map((post) => post.type),
	};
};
