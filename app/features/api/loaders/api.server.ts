import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import * as ApiRepository from "../ApiRepository.server";
import { checkUserHasApiAccess } from "../core/perms";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);

	const hasApiAccess = await checkUserHasApiAccess(user);

	if (!hasApiAccess) {
		return {
			hasAccess: false,
			apiToken: null,
		};
	}

	const apiToken = await ApiRepository.findTokenByUserId(user.id);

	return {
		hasAccess: true,
		apiToken: apiToken?.token ?? null,
	};
};
