import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as LFGRepository from "../LFGRepository.server";
import { lfgNewSearchParams } from "../lfg-search-params";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { postId } = lfgNewSearchParams.parse(request);

	const team = await TeamRepository.teams()
		.mainTeamOf(user.id)
		.executeTakeFirst();
	const userMatchProfile = await MatchProfileRepository.findSettingsByUserId(
		user.id,
	);
	const ownPosts = await LFGRepository.posts().ownedByActor().execute();
	const postToEdit = ownPosts.find((post) => post.id === postId);

	return {
		team,
		weaponPool: userMatchProfile.weaponPool,
		languages: postToEdit?.languages ?? userMatchProfile.languages,
		postToEdit,
		userPostTypes: ownPosts.map((post) => post.type),
	};
};
