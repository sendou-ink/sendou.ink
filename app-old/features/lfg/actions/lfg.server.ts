import type { ActionFunctionArgs } from "@remix-run/node";
import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import { isAdmin } from "~/permissions";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { _action, id } from "~/utils/zod";
import * as LFGRepository from "../LFGRepository.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema,
	});

	const posts = await LFGRepository.posts(user);
	const post = posts.find((post) => post.id === data.id);
	errorToastIfFalsy(post, "Post not found");
	errorToastIfFalsy(
		isAdmin(user) || post.author.id === user.id,
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

const schema = z.union([
	z.object({
		_action: _action("DELETE_POST"),
		id,
	}),
	z.object({
		_action: _action("BUMP_POST"),
		id,
	}),
]);
