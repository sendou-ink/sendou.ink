import type { AuthenticatedUser } from "~/features/auth/core/user.server";
import { resolveSidebarData } from "~/features/sidebar/core/sidebar.server";
import { GIT_COMMIT } from "~/utils/git-commit";

/**
 * App shell data that goes stale while a page sits open; shared by the root loader and the route
 * `LayoutDataProvider` polls so they can't drift. Notifications have their own route (`NotificationsProvider`).
 */
export async function resolveLayoutData(user: AuthenticatedUser | undefined) {
	return {
		loggedInUserId: user?.id ?? null,
		sidebar: await resolveSidebarData(user),
		buildCommit: GIT_COMMIT,
	};
}
