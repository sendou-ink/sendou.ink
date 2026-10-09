import { requireUser } from "~/features/auth/core/user.server";
import { isAdmin, isDev } from "~/modules/permissions/utils";

export function requireVoiceDashboardAccess() {
	const user = requireUser();
	if (!isAdmin(user) && !isDev(user)) {
		throw new Response("Forbidden", { status: 403 });
	}

	return user;
}
