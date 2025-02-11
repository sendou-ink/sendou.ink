import type { LoaderFunctionArgs } from "@remix-run/node";
import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import * as QSettingsRepository from "~/features/sendouq-settings/QSettingsRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseSafeSearchParams } from "~/utils/remix.server";
import type { Unpacked } from "~/utils/types";
import { id } from "~/utils/zod";
import * as LFGRepository from "../LFGRepository.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);

	const userProfileData = await UserRepository.findProfileByIdentifier(
		String(user.id),
	);
	const userQSettingsData = await QSettingsRepository.settingsByUserId(user.id);
	const allPosts = await LFGRepository.posts(user);

	return {
		team: userProfileData?.team,
		weaponPool: userProfileData?.weapons,
		languages: userQSettingsData.languages,
		postToEdit: searchParamsToBuildToEdit(request, user.id, allPosts),
		userPostTypes: userPostTypes(allPosts, user.id),
	};
};

const searchParamsSchema = z.object({
	postId: id,
});

const searchParamsToBuildToEdit = (
	request: LoaderFunctionArgs["request"],
	userId: number,
	allPosts: Unpacked<ReturnType<typeof LFGRepository.posts>>,
) => {
	const params = parseSafeSearchParams({ request, schema: searchParamsSchema });

	if (!params.success) return;

	const post = allPosts.find(
		(p) => p.id === params.data.postId && p.author.id === userId,
	);

	return post;
};

const userPostTypes = (
	allPosts: Unpacked<ReturnType<typeof LFGRepository.posts>>,
	userId: number,
) =>
	allPosts.filter((post) => post.author.id === userId).map((post) => post.type);
