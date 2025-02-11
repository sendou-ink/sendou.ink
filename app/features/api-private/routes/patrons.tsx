import type { ActionFunction, LoaderFunctionArgs } from "@remix-run/node";
import { getUserId } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { updatePatreonData } from "~/modules/patreon";
import { canAccessLohiEndpoint, canPerformAdminActions } from "~/permissions";
import { validate } from "~/utils/remix.server";

export const action: ActionFunction = async ({ request }) => {
	const user = await getUserId(request);

	if (!canPerformAdminActions(user) && !canAccessLohiEndpoint(request)) {
		throw new Response("Not authorized", { status: 403 });
	}

	await updatePatreonData();

	return null;
};

export const loader = ({ request }: LoaderFunctionArgs) => {
	validate(canAccessLohiEndpoint(request), "Invalid token", 403);

	return UserRepository.findAllPatrons();
};
