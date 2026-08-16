import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import * as LFGRepository from "../LFGRepository.server";
import { lfgActionSchema } from "../lfg-schemas";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: lfgActionSchema,
	});

	const posts = await LFGRepository.findAllPosts(user);
	const post = posts.find((post) => post.id === data.id);
	errorToastIfFalsy(post, "Post not found");

	switch (data._action) {
		case "DELETE_POST": {
			requirePermission(post, "DELETE");
			await LFGRepository.deletePost(data.id);
			break;
		}
		case "BUMP_POST": {
			requirePermission(post, "EDIT");
			await LFGRepository.bumpPost(data.id);
			break;
		}
	}

	return null;
};
