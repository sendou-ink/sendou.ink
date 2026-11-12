import { query } from "$app/server";
import { getUser } from "#lib/server/shims/user.server.ts";

/** The acting user (the impersonated one when impersonating), with only what the client shows of them. */
export const getLoggedInUser = query(() => {
	const user = getUser();
	if (!user) return undefined;

	return {
		id: user.id,
		username: user.username,
		customUrl: user.customUrl,
		avatar: user.avatar,
		roles: user.roles,
	};
});
