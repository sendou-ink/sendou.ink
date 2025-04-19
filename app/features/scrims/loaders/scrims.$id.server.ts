import type { LoaderFunctionArgs } from "@remix-run/node";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { isMod } from "../../../permissions";
import { notFoundIfFalsy } from "../../../utils/remix.server";
import { requireUser } from "../../auth/core/user.server";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import * as Scrim from "../core/Scrim";
import { FF_SCRIMS_ENABLED } from "../scrims-constants";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	notFoundIfFalsy(FF_SCRIMS_ENABLED);

	const user = await requireUser(request);

	const post = notFoundIfFalsy(
		await ScrimPostRepository.findById(Number(params.id)),
	);

	if (!Scrim.isAccepted(post)) {
		throw new Response(null, { status: 404 });
	}

	if (!Scrim.isParticipating(post, user.id) && !isMod(user)) {
		throw new Response(null, { status: 403 });
	}

	return {
		post,
		chatUsers: await UserRepository.findChatUsersByUserIds(
			post.users.map((u) => u.id),
		),
	};
};
