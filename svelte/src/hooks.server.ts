import type { Handle } from "@sveltejs/kit/hooks";
import { getRequestEvent } from "$app/server";
import { userIsBanned } from "~/features/ban/core/banned.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import * as LanguageDetection from "~/modules/i18n/LanguageDetection";
import {
	baseLocale,
	locales,
	overwriteGetLocale,
} from "#lib/paraglide/runtime.js";
import {
	AUTH_COOKIE_NAME,
	readPlainCookie,
	readSessionCookie,
	sessionUserId,
	THEME_COOKIE_NAME,
} from "#lib/server/auth/session.ts";

const LANGUAGE_COOKIE_NAME = "i18n-site";

overwriteGetLocale(() => {
	try {
		return getRequestEvent().locals.locale;
	} catch {
		return baseLocale;
	}
});

export const handle: Handle = async ({ event, resolve }) => {
	const locale =
		LanguageDetection.match(
			[
				readPlainCookie(event.cookies.get(LANGUAGE_COOKIE_NAME)),
				...LanguageDetection.acceptedLanguages(
					event.request.headers.get("Accept-Language"),
				),
			],
			locales,
		) ?? baseLocale;
	event.locals.locale = locale;

	const userId = sessionUserId(
		readSessionCookie(event.cookies.get(AUTH_COOKIE_NAME)),
	);
	if (userId && !userIsBanned(userId)) {
		event.locals.user = await UserRepository.findLeanById(userId);
	}

	const theme = readSessionCookie(event.cookies.get(THEME_COOKIE_NAME))?.theme;
	const themeClass = theme === "light" || theme === "dark" ? theme : "";

	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace("%lang%", locale).replace("%theme%", themeClass),
	});
};
