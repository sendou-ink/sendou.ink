import type { ActionFunction } from "@remix-run/node";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { canAccessLohiEndpoint } from "~/permissions";

export const action: ActionFunction = async ({ request }) => {
	if (!canAccessLohiEndpoint(request)) {
		throw new Response(null, { status: 403 });
	}

	// input untyped but we trust Lohi to give us correctly shaped request here
	UserRepository.updateMany(await request.json());

	return null;
};
