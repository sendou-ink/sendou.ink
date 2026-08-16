import type { Handle } from "@sveltejs/kit/hooks";
import { userIsBanned } from "#lib/features/ban/banned.server.ts";
import {
	AUTH_COOKIE_NAME,
	readSessionCookie,
	sessionUserId,
} from "#lib/features/auth/session.server.ts";
import { getTheme } from "#lib/features/theme/theme.server.ts";
import * as UserRepository from "#lib/features/user-page/UserRepository.server.ts";
import { paraglideMiddleware } from "#lib/paraglide/server.js";

export const handle: Handle = async ({ event, resolve }) => {
	const session = readSessionCookie(event.cookies.get(AUTH_COOKIE_NAME));
	const userId = sessionUserId(session);

	if (userId && !(await userIsBanned(userId))) {
		event.locals.user = await UserRepository.findLeanById(userId);
	}

	return paraglideMiddleware(
		event.request,
		// no URL-based locale strategy is in use, so the request needs no rewriting
		({ locale }) => {
			return resolve(event, {
				transformPageChunk: ({ html }) => {
					const theme = getTheme(event.cookies);
					return html
						.replace("%lang%", locale)
						.replace("%theme%", theme ? `${theme} ` : "");
				},
			});
		},
	);
};
