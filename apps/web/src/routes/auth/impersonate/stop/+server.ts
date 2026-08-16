import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
	AUTH_COOKIE_NAME,
	authCookieOptions,
	IMPERSONATED_SESSION_KEY,
	readSessionCookie,
	writeSessionCookie,
} from "#lib/features/auth/session.server.ts";

export const POST: RequestHandler = ({ cookies }) => {
	const session = readSessionCookie(cookies.get(AUTH_COOKIE_NAME)) ?? {};
	delete session[IMPERSONATED_SESSION_KEY];
	cookies.set(
		AUTH_COOKIE_NAME,
		writeSessionCookie(session),
		authCookieOptions,
	);

	redirect(303, "/admin");
};
