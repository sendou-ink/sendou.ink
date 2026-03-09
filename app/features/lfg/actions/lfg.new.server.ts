import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import type { Tables } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseFormData } from "~/form/parse.server";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { LFG_PAGE } from "~/utils/urls";
import * as LFGRepository from "../LFGRepository.server";
import { TEAM_POST_TYPES } from "../lfg-constants";
import { lfgNewSchema } from "../lfg-schemas";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = requireUser();
	const result = await parseFormData({
		request,
		schema: lfgNewSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;
	const type = data.type as Tables["LFGPost"]["type"];

	const identifier = String(user.id);
	const { team } =
		(await UserRepository.findProfileByIdentifier(identifier)) ?? {};

	const shouldIncludeTeam = TEAM_POST_TYPES.includes(type);

	errorToastIfFalsy(
		!shouldIncludeTeam || team,
		"Team needs to be set for this type of post",
	);

	const plusTierVisibility = data.plusTierVisibility
		? Number(data.plusTierVisibility)
		: null;

	if (data.postId) {
		await validateCanUpdatePost({
			postId: data.postId,
			user,
		});

		await LFGRepository.updatePost(data.postId, {
			text: data.postText,
			timezone: data.timezone,
			type,
			teamId: shouldIncludeTeam ? team?.id : null,
			plusTierVisibility,
			languages: data.languages.length > 0 ? data.languages.join(",") : null,
		});
	} else {
		await LFGRepository.insertPost({
			text: data.postText,
			timezone: data.timezone,
			type,
			teamId: shouldIncludeTeam ? team?.id : null,
			authorId: user.id,
			plusTierVisibility,
			languages: data.languages.length > 0 ? data.languages.join(",") : null,
		});
	}

	return redirect(LFG_PAGE);
};

const validateCanUpdatePost = async ({
	postId,
	user,
}: {
	postId: number;
	user: { id: number; plusTier: number | null };
}) => {
	const posts = await LFGRepository.posts(user);
	const post = posts.find((post) => post.id === postId);
	errorToastIfFalsy(post, "Post to update not found");
	errorToastIfFalsy(
		post.author.id === user.id,
		"You can only update your own posts",
	);
};
