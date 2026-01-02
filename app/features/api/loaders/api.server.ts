import { requireUser } from "~/features/auth/core/user.server";
import * as ApiRepository from "../ApiRepository.server";
import { checkUserHasApiAccess } from "../core/perms";

export const loader = async () => {
	const user = await requireUser();

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
