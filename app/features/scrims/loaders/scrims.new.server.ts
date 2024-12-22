import type { LoaderFunctionArgs } from "@remix-run/node";
import { getUser } from "~/features/auth/core/user.server";
import * as TeamRepository from "../../team/TeamRepository.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUser(request);

	return {
		teams: user ? await TeamRepository.teamsByMemberUserId(user.id) : [],
	};
};
