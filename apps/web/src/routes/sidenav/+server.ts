import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
	readSessionCookie,
	writeSessionCookie,
} from "#lib/features/auth/session.server.ts";
import { ServerConfig } from "#lib/server/config.ts";
import { IS_E2E_TEST_RUN } from "#lib/utils/e2e.ts";

const SIDENAV_COOKIE_NAME = "sidenav";
const TEN_YEARS_IN_SECONDS = 315_360_000;

export const POST: RequestHandler = async ({ request, cookies }) => {
	const form = new URLSearchParams(await request.text());
	const collapsed = form.get("collapsed") === "true";

	const session =
		readSessionCookie(cookies.get(SIDENAV_COOKIE_NAME)) ?? {};
	session.collapsed = collapsed;
	cookies.set(SIDENAV_COOKIE_NAME, writeSessionCookie(session), {
		secure: ServerConfig.isProduction && !IS_E2E_TEST_RUN,
		sameSite: "lax",
		path: "/",
		httpOnly: true,
		maxAge: TEN_YEARS_IN_SECONDS,
	});

	return json({ success: true });
};
