import { requireUser } from "~/features/auth/core/user.server";
import * as ApiRepository from "../ApiRepository.server";
import { checkUserHasApiAccess } from "../core/perms";

export const loader = async () => {
	const user = requireUser();

	const hasApiAccess = await checkUserHasApiAccess(user);

	if (!hasApiAccess) {
		return {
			hasAccess: false,
			readToken: null,
			writeToken: null,
		};
	}

	const [readToken, writeToken] = await Promise.all([
		ApiRepository.findTokenByUserId(user.id, "read"),
		ApiRepository.findTokenByUserId(user.id, "write"),
	]);

	return {
		hasAccess: true,
		readToken: readToken?.token ?? null,
		writeToken: writeToken?.token ?? null,
	};
};
