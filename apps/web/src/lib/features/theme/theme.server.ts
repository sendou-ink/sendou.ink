import type { Cookies } from "@sveltejs/kit";
import {
	readSessionCookie,
	writeSessionCookie,
} from "#lib/features/auth/session.server.ts";
import { ServerConfig } from "#lib/server/config.ts";
import { IS_E2E_TEST_RUN } from "#lib/utils/e2e.ts";

/**
 * The theme cookie, byte-compatible with the React app's signed `theme`
 * session cookie so user theme choices survive the cutover.
 */

export const THEME_COOKIE_NAME = "theme";

const TEN_YEARS_IN_SECONDS = 315_360_000;

export type Theme = "dark" | "light";

export function isTheme(value: unknown): value is Theme {
	return value === "dark" || value === "light";
}

const themeCookieOptions = {
	secure: ServerConfig.isProduction && !IS_E2E_TEST_RUN,
	sameSite: "lax",
	path: "/",
	httpOnly: true,
	maxAge: TEN_YEARS_IN_SECONDS,
} as const;

/** The user's explicitly chosen theme, or `null` when following the system theme. */
export function getTheme(cookies: Cookies): Theme | null {
	const session = readSessionCookie(cookies.get(THEME_COOKIE_NAME));
	const themeValue = session?.theme;

	return isTheme(themeValue) ? themeValue : null;
}

export function setTheme(cookies: Cookies, theme: Theme) {
	cookies.set(
		THEME_COOKIE_NAME,
		writeSessionCookie({ theme }),
		themeCookieOptions,
	);
}

export function clearTheme(cookies: Cookies) {
	cookies.delete(THEME_COOKIE_NAME, { path: "/" });
}
