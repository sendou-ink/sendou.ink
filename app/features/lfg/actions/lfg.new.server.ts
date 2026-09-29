import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import type { Tables } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseFormData } from "~/form/parse.server";
import { requirePermission } from "~/modules/permissions/guards.server";
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

	const { team } = (await UserRepository.findProfileByUserId(user.id)) ?? {};

	const shouldIncludeTeam = TEAM_POST_TYPES.includes(type);

	errorToastIfFalsy(
		!shouldIncludeTeam || team,
		"Team needs to be set for this type of post",
	);

	const plusTierVisibility = data.plusTierVisibility
		? Number(data.plusTierVisibility)
		: null;

	if (data.postId) {
		await validateCanUpdatePost(data.postId);

		await LFGRepository.updateById(data.postId, {
			text: data.postText,
			timezone: data.timezone,
			type,
			teamId: shouldIncludeTeam ? team?.id : null,
			plusTierVisibility,
			languages:
				data.languages.length > 0 ? JSON.stringify(data.languages) : null,
		});
	} else {
		await LFGRepository.insert({
			text: data.postText,
			timezone: data.timezone,
			type,
			teamId: shouldIncludeTeam ? team?.id : null,
			authorId: user.id,
			plusTierVisibility,
			languages:
				data.languages.length > 0 ? JSON.stringify(data.languages) : null,
		});
	}

	return redirect(LFG_PAGE);
};

const validateCanUpdatePost = async (postId: number) => {
	const post = await LFGRepository.posts()
		.visibleToActor()
		.where({ id: postId })
		.executeTakeFirst();
	errorToastIfFalsy(post, "Post to update not found");
	requirePermission(post, "EDIT");
};
