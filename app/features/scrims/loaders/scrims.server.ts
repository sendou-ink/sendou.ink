import type { LoaderFunctionArgs } from "@remix-run/node";
import * as AssociationsRepository from "~/features/associations/AssociationRepository.server";
import * as Association from "~/features/associations/core/Association";
import { getUser } from "~/features/auth/core/user.server";
import { notFoundIfFalsy } from "~/utils/remix.server";
import * as TeamRepository from "../../team/TeamRepository.server";
import * as Scrim from "../core/Scrim";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import { FF_SCRIMS_ENABLED } from "../scrims-constants";
import { dividePosts } from "../scrims-utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	notFoundIfFalsy(FF_SCRIMS_ENABLED);

	const user = await getUser(request);

	const now = new Date();
	const associations = user
		? await AssociationsRepository.findByMemberUserId(user?.id)
		: null;

	const posts = (await ScrimPostRepository.findAllRelevant(user?.id))
		.filter(
			(post) =>
				(user && Scrim.isParticipating(post, user.id)) ||
				Association.isVisible({
					associations,
					time: now,
					visibility: post.visibility,
				}),
		)
		.map((post) => ({
			...post,
			visibility: null,
			isPrivate: !Association.isPublic({
				time: now,
				visibility: post.visibility,
			}),
		}));

	return {
		posts: dividePosts(posts, user?.id),
		teams: user ? await TeamRepository.teamsByMemberUserId(user.id) : [],
	};
};
