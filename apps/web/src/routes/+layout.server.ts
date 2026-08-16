import { readSessionCookie } from "#lib/features/auth/session.server.ts";
import { resolveSidebarData } from "#lib/features/sidebar/sidebar.server.ts";
import { getTheme } from "#lib/features/theme/theme.server.ts";
import type { LayoutServerLoad } from "./$types";

const SIDENAV_COOKIE_NAME = "sidenav";

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const user = locals.user;

	const sidenavSession = readSessionCookie(cookies.get(SIDENAV_COOKIE_NAME));

	return {
		user: user
			? {
					id: user.id,
					username: user.username,
					discordId: user.discordId,
					discordAvatar: user.discordAvatar,
					customUrl: user.customUrl,
					customAvatarUrl: user.customAvatarUrl,
					inGameName: user.inGameName,
					friendCode: user.friendCode,
					preferences: user.preferences,
					languages: user.languages,
					plusTier: user.plusTier,
					roles: user.roles,
					createdAt: user.createdAt,
				}
			: undefined,
		sidenavCollapsed: sidenavSession?.collapsed === true,
		sidebar: await resolveSidebarData(user?.id ?? null),
		theme: getTheme(cookies),
	};
};
