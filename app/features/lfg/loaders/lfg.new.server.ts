import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { Unpacked } from "~/utils/types";
import * as LFGRepository from "../LFGRepository.server";
import { lfgNewSearchParams } from "../lfg-search-params";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = requireUser();

	const userProfileData = await UserRepository.findProfileByIdentifier(
		String(user.id),
	);
	const userMatchProfile = await MatchProfileRepository.findSettingsByUserId(
		user.id,
	);
	const allPosts = await LFGRepository.findAllPosts(user);
	const postToEdit = searchParamsToBuildToEdit(request, user.id, allPosts);

	return {
		team: userProfileData?.team,
		weaponPool: userProfileData?.weapons,
		languages: postToEdit?.languages ?? userMatchProfile.languages,
		postToEdit,
		userPostTypes: userPostTypes(allPosts, user.id),
	};
};

const searchParamsToBuildToEdit = (
	request: LoaderFunctionArgs["request"],
	userId: number,
	allPosts: Unpacked<ReturnType<typeof LFGRepository.findAllPosts>>,
) => {
	const { postId } = lfgNewSearchParams.parse(request);

	if (postId === null) return;

	const post = allPosts.find((p) => p.id === postId && p.author.id === userId);

	return post;
};

const userPostTypes = (
	allPosts: Unpacked<ReturnType<typeof LFGRepository.findAllPosts>>,
	userId: number,
) =>
	allPosts.filter((post) => post.author.id === userId).map((post) => post.type);
