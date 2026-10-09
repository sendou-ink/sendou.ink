import { requireUser } from "~/features/auth/core/user.server";
import { defineAction } from "~/form/define-action.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { errorToastIfFalsy } from "~/utils/remix.server";
import * as LFGRepository from "../LFGRepository.server";
import { lfgActionSchema } from "../lfg-schemas";

export const action = defineAction(
	{ body: lfgActionSchema },
	async ({ body }) => {
		const user = requireUser();

		const posts = await LFGRepository.findAllPosts(user);
		const post = posts.find((candidate) => candidate.id === body.id);
		errorToastIfFalsy(post, "Post not found");

		switch (body._action) {
			case "DELETE_POST": {
				requirePermission(post, "DELETE");
				await LFGRepository.deletePost(body.id);
				break;
			}
			case "BUMP_POST": {
				requirePermission(post, "EDIT");
				await LFGRepository.bumpPost(body.id);
				break;
			}
		}

		return null;
	},
);
