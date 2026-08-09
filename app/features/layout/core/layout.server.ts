import type { AuthenticatedUser } from "~/features/auth/core/user.server";
import { resolveSidebarData } from "~/features/sidebar/core/sidebar.server";
import { GIT_COMMIT } from "~/utils/git-commit";

/**
 * The parts of the app shell that go stale on their own while a page sits open.
 * Served both by the root loader and by the resource route `LayoutDataProvider`
 * polls, so the two payloads can't drift apart. Notifications are not part of
 * this: they live in their own resource route refetched when skalop pings that
 * they changed (see `NotificationsProvider`).
 */
export async function resolveLayoutData(user: AuthenticatedUser | undefined) {
	return {
		loggedInUserId: user?.id ?? null,
		sidebar: await resolveSidebarData(user?.id ?? null),
		buildCommit: GIT_COMMIT,
	};
}
