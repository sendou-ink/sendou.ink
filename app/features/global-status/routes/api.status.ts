import { requireUser } from "~/features/auth/core/user.server";
import { resolveGlobalStatus } from "../core/global-status.server";

/**
 * The header status indicator's data. Fetched by `GlobalStatusProvider`
 * whenever an event announces that the user's status changed, instead of being
 * polled with the rest of the app shell data.
 */
export const loader = async () => {
	const user = requireUser();

	return {
		globalStatus: await resolveGlobalStatus(user.id),
	};
};
