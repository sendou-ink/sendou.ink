import { getUser } from "~/features/auth/core/user.server";
import { resolveGlobalStatus } from "../core/global-status.server";

/**
 * The header status indicator's data. Fetched by `GlobalStatusProvider`
 * whenever an event announces that the user's status changed, instead of being
 * polled with the rest of the app shell data.
 */
// xxx: or just requireUser?
export const loader = async () => {
	const user = getUser();

	return {
		globalStatus: user ? await resolveGlobalStatus(user.id) : null,
	};
};
