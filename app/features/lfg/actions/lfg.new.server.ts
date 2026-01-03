import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { LFG_PAGE } from "~/utils/urls";
import { falsyToNull, id, noDuplicates, safeJSONParse } from "~/utils/zod";
import { languagesUnified } from "../../../modules/i18n/config";
import * as LFGRepository from "../LFGRepository.server";
import { LFG, TEAM_POST_TYPES, TIMEZONES } from "../lfg-constants";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser();
	const data = await parseRequestPayload({
		request,
		schema,
	});

	const identifier = String(user.id);
	const { team } =
		(await UserRepository.findProfileByIdentifier(identifier)) ?? {};

	const shouldIncludeTeam = TEAM_POST_TYPES.includes(data.type);

	errorToastIfFalsy(
		!shouldIncludeTeam || team,
		"Team needs to be set for this type of post",
	);

	if (data.postId) {
		await validateCanUpdatePost({
			postId: data.postId,
			user,
		});

		await LFGRepository.updatePost(data.postId, {
			text: data.postText,
			timezone: data.timezone,
			type: data.type,
			teamId: shouldIncludeTeam ? team?.id : null,
			plusTierVisibility: data.plusTierVisibility,
			languages: data.languages.length > 0 ? data.languages.join(",") : null,
		});
	} else {
		await LFGRepository.insertPost({
			text: data.postText,
			timezone: data.timezone,
			type: data.type,
			teamId: shouldIncludeTeam ? team?.id : null,
			authorId: user.id,
			plusTierVisibility: data.plusTierVisibility,
			languages: data.languages.length > 0 ? data.languages.join(",") : null,
		});
	}

	return redirect(LFG_PAGE);
};

const schema = z.object({
	postId: id.optional(),
	type: z.enum(LFG.types),
	postText: z.string().min(LFG.MIN_TEXT_LENGTH).max(LFG.MAX_TEXT_LENGTH),
	timezone: z.string().refine((val) => TIMEZONES.includes(val)),
	plusTierVisibility: z.preprocess(
		falsyToNull,
		z.coerce.number().int().min(1).max(3).nullish(),
	),
	languages: z.preprocess(
		safeJSONParse,
		z
			.array(z.string())
			.refine(noDuplicates)
			.refine((val) =>
				val.every((lang) => languagesUnified.some((l) => l.code === lang)),
			),
	),
});

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
