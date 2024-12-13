import type { LoaderFunctionArgs } from "@remix-run/node";
import { getUser } from "~/features/auth/core/user.server";
import * as TeamRepository from "../../team/TeamRepository.server";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import { dividePosts } from "../scrims-utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUser(request);

	return {
		posts: dividePosts(
			await ScrimPostRepository.findAllRelevant(user?.id),
			user?.id,
		),
		teams: user ? await TeamRepository.teamsByMemberUserId(user.id) : [],
	};
};
