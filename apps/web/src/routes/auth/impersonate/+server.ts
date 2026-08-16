import { error, redirect } from "@sveltejs/kit";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "#lib/features/admin/dev-controls.server.ts";
import {
	AUTH_COOKIE_NAME,
	authCookieOptions,
	IMPERSONATED_SESSION_KEY,
	readSessionCookie,
	writeSessionCookie,
} from "#lib/features/auth/session.server.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({
	request,
	url,
	cookies,
	locals,
}) => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		const user = locals.user;
		const canImpersonate =
			user?.roles.includes("ADMIN") || user?.roles.includes("DEV");
		if (!canImpersonate) {
			error(403, "Forbidden");
		}
	}

	const rawId = url.searchParams.get("id");
	const userId = Number(rawId);
	if (!rawId || Number.isNaN(userId)) {
		error(400, "Invalid user id");
	}

	const session = readSessionCookie(cookies.get(AUTH_COOKIE_NAME)) ?? {};
	session[IMPERSONATED_SESSION_KEY] = userId;
	cookies.set(AUTH_COOKIE_NAME, writeSessionCookie(session), authCookieOptions);

	const formData = await request.formData().catch(() => null);
	const returnTo = formData?.get("returnTo");
	const redirectTo =
		typeof returnTo === "string" &&
		returnTo.startsWith("/") &&
		!returnTo.startsWith("//")
			? returnTo
			: "/admin";

	redirect(303, redirectTo);
};
