import { error, redirect } from "@sveltejs/kit";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import {
	AUTH_COOKIE_NAME,
	authCookieOptions,
	IMPERSONATED_SESSION_KEY,
	readSessionCookie,
	writeSessionCookie,
} from "#lib/server/auth/session.ts";
import type { RequestHandler } from "./$types";

// logging in is still the React app's job; this covers what development and the e2e suite need
export const POST: RequestHandler = ({ url, cookies }) => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) error(403, "Forbidden");

	const userId = Number(url.searchParams.get("id"));
	if (!Number.isInteger(userId) || userId < 1) error(400, "Bad Request");

	const session = readSessionCookie(cookies.get(AUTH_COOKIE_NAME)) ?? {};
	cookies.set(
		AUTH_COOKIE_NAME,
		writeSessionCookie({ ...session, [IMPERSONATED_SESSION_KEY]: userId }),
		authCookieOptions,
	);

	redirect(303, "/associations");
};
