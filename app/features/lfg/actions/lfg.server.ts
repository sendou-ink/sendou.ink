import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
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
	errorToastIfFalsy(
		post.author.id === user.id || user.roles.includes("ADMIN"),
		"Not your own post",
	);

	switch (data._action) {
		case "DELETE_POST": {
			await LFGRepository.deletePost(data.id);
			break;
		}
		case "BUMP_POST": {
			await LFGRepository.bumpPost(data.id);
			break;
		}
	}

	return null;
};
