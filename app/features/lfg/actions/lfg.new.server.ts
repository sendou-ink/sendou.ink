import { redirect } from "react-router";
import type { Tables } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { LFG_PAGE } from "~/utils/urls";
import * as LFGRepository from "../LFGRepository.server";
import { TEAM_POST_TYPES } from "../lfg-constants";
import { lfgNewSchema } from "../lfg-schemas";

export const action = defineAction({ body: lfgNewSchema }, async ({ body }) => {
	const user = requireUser();
	const type = body.type as Tables["LFGPost"]["type"];

	const { team } = (await UserRepository.findProfileByUserId(user.id)) ?? {};

	const shouldIncludeTeam = TEAM_POST_TYPES.includes(type);

	errorToastIfFalsy(
		!shouldIncludeTeam || team,
		"Team needs to be set for this type of post",
	);

	const plusTierVisibility = body.plusTierVisibility
		? Number(body.plusTierVisibility)
		: null;

	if (body.postId) {
		await validateCanUpdatePost({
			postId: body.postId,
			user,
		});

		await LFGRepository.updatePost(body.postId, {
			text: body.postText,
			timezone: body.timezone,
			type,
			teamId: shouldIncludeTeam ? team?.id : null,
			plusTierVisibility,
			languages:
				body.languages.length > 0 ? JSON.stringify(body.languages) : null,
		});
	} else {
		await LFGRepository.insertPost({
			text: body.postText,
			timezone: body.timezone,
			type,
			teamId: shouldIncludeTeam ? team?.id : null,
			authorId: user.id,
			plusTierVisibility,
			languages:
				body.languages.length > 0 ? JSON.stringify(body.languages) : null,
		});
	}

	return redirect(LFG_PAGE);
});

const validateCanUpdatePost = async ({
	postId,
	user,
}: {
	postId: number;
	user: { id: number; plusTier: number | null };
}) => {
	const posts = await LFGRepository.findAllPosts(user);
	const post = posts.find((candidate) => candidate.id === postId);
	errorToastIfFalsy(post, "Post to update not found");
	requirePermission(post, "EDIT");
};
