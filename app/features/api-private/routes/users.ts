import type { ActionFunction } from "react-router";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { canAccessLohiEndpoint, forbidden } from "~/utils/remix.server";

export const action: ActionFunction = async ({ request }) => {
	if (!canAccessLohiEndpoint(request)) {
		forbidden();
	}

	// input untyped but we trust Lohi to give us correctly shaped request here
	await UserRepository.updateMany(await request.json());

	return null;
};
