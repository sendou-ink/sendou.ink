import type { AuthenticatedUser } from "~/features/auth/core/user.server";
import * as NotificationRepository from "~/features/notifications/NotificationRepository.server";
import { NOTIFICATIONS } from "~/features/notifications/notifications-contants";
import { resolveSidebarData } from "~/features/sidebar/core/sidebar.server";
import { GIT_COMMIT } from "~/utils/git-commit";

/**
 * The parts of the app shell that go stale on their own while a page sits open.
 * Served both by the root loader and by the resource route `LayoutDataProvider`
 * polls, so the two payloads can't drift apart.
 */
export async function resolveLayoutData(user: AuthenticatedUser | undefined) {
	return {
		loggedInUserId: user?.id ?? null,
		sidebar: await resolveSidebarData(user?.id ?? null),
		notifications: user
			? await NotificationRepository.findByUserId(user.id, {
					limit: NOTIFICATIONS.PEEK_COUNT,
				})
			: undefined,
		buildCommit: GIT_COMMIT,
	};
}
