import type { LoaderFunctionArgs } from "@remix-run/node";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { isMod } from "../../../permissions";
import { notFoundIfFalsy } from "../../../utils/remix.server";
import { requireUser } from "../../auth/core/user.server";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import * as ScrimPost from "../core/ScrimPost";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const user = await requireUser(request);

	const post = notFoundIfFalsy(
		await ScrimPostRepository.findById(Number(params.id)),
	);

	if (!ScrimPost.isAccepted(post)) {
		throw new Response(null, { status: 404 });
	}

	if (!ScrimPost.isParticipating(post, user.id) && !isMod(user)) {
		throw new Response(null, { status: 403 });
	}

	return {
		post,
		chatUsers: await UserRepository.findChatUsersByUserIds(
			post.users.map((u) => u.id),
		),
	};
};
