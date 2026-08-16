import type { Cookies } from "@sveltejs/kit";
import {
	readSessionCookie,
	writeSessionCookie,
} from "#lib/features/auth/session.server.ts";
import { ServerConfig } from "#lib/server/config.ts";
import { IS_E2E_TEST_RUN } from "#lib/utils/e2e.ts";

const SIDENAV_COOKIE_NAME = "sidenav";
const TEN_YEARS_IN_SECONDS = 315_360_000;

/** Reads the desktop sidenav collapsed preference from its cookie. */
export function readSidenavCollapsed(cookies: Cookies): boolean {
	return readSessionCookie(cookies.get(SIDENAV_COOKIE_NAME))?.collapsed === true;
}

/** Persists the desktop sidenav collapsed preference into its cookie. */
export function writeSidenavCollapsed(cookies: Cookies, collapsed: boolean) {
	const session = readSessionCookie(cookies.get(SIDENAV_COOKIE_NAME)) ?? {};
	session.collapsed = collapsed;
	cookies.set(SIDENAV_COOKIE_NAME, writeSessionCookie(session), {
		secure: ServerConfig.isProduction && !IS_E2E_TEST_RUN,
		sameSite: "lax",
		path: "/",
		httpOnly: true,
		maxAge: TEN_YEARS_IN_SECONDS,
	});
}
