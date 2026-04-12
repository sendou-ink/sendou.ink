import { isbot } from "isbot";
import type { ActionFunction, LoaderFunction } from "react-router";
import { redirect } from "react-router";
import { z } from "zod";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { isAdmin, isStaff } from "~/modules/permissions/utils";
import { logger } from "~/utils/logger";
import {
	canAccessLohiEndpoint,
	errorToastIfFalsy,
	parseSearchParams,
} from "~/utils/remix.server";
import { ADMIN_PAGE, authErrorUrl } from "~/utils/urls";
import * as LogInLinkRepository from "../LogInLinkRepository.server";
import {
	authenticator,
	IMPERSONATED_SESSION_KEY,
	SESSION_KEY,
} from "./authenticator.server";
import type { AuthErrorCode } from "./errors";
import { authSessionStorage } from "./session.server";
import { getUser } from "./user.server";

export const callbackLoader: LoaderFunction = async ({ request }) => {
	const url = new URL(request.url);
	if (url.searchParams.get("error") === "access_denied") {
		// The user denied the authentication request
		// https://www.oauth.com/oauth2-servers/server-side-apps/possible-errors/

		throw redirect(authErrorUrl("aborted"));
	}

	try {
		const userId = await authenticator.authenticate("discord", request);

		const session = await authSessionStorage.getSession(
			request.headers.get(SESSION_KEY),
		);

		session.set(SESSION_KEY, userId);

		return redirect("/", {
			headers: {
				"Set-Cookie": await authSessionStorage.commitSession(session),
			},
		});
	} catch (error) {
		if (error instanceof Error) {
			logger.error(
				`Error during authentication (${classifyAuthError(error)}):`,
				error,
			);
			throw redirect(authErrorUrl(classifyAuthError(error)));
		}

		throw error;
	}
};

export const logOutAction: ActionFunction = async ({ request }) => {
	const session = await authSessionStorage.getSession(
		request.headers.get(SESSION_KEY),
	);
	return redirect("/", {
		headers: { "Set-Cookie": await authSessionStorage.destroySession(session) },
	});
};

export const logInAction: ActionFunction = async ({ request }) => {
	errorToastIfFalsy(
		process.env.LOGIN_DISABLED !== "true",
		"Login is temporarily disabled",
	);

	return await authenticator.authenticate("discord", request);
};

export const impersonateAction: ActionFunction = async ({ request }) => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		const user = requireUser();
		if (!user.roles.includes("ADMIN") && !user.roles.includes("DEV")) {
			throw new Response("Forbidden", { status: 403 });
		}

		if (user.roles.includes("DEV") && !user.roles.includes("ADMIN")) {
			const url = new URL(request.url);
			const targetId = Number(url.searchParams.get("id"));
			if (isAdmin({ id: targetId }) || isStaff({ id: targetId })) {
				throw new Response("Forbidden", { status: 403 });
			}
		}
	}

	const session = await authSessionStorage.getSession(
		request.headers.get("Cookie"),
	);

	const realUserId = session.get(SESSION_KEY);

	const url = new URL(request.url);
	const rawId = url.searchParams.get("id");

	const userId = Number(url.searchParams.get("id"));
	if (!rawId || Number.isNaN(userId)) throw new Response(null, { status: 400 });

	logger.info(
		`Impersonation: user ${realUserId} started impersonating user ${userId}`,
	);

	session.set(IMPERSONATED_SESSION_KEY, userId);

	throw redirect(ADMIN_PAGE, {
		headers: { "Set-Cookie": await authSessionStorage.commitSession(session) },
	});
};

export const stopImpersonatingAction: ActionFunction = async ({ request }) => {
	const session = await authSessionStorage.getSession(
		request.headers.get("Cookie"),
	);

	const realUserId = session.get(SESSION_KEY);
	const impersonatedUserId = session.get(IMPERSONATED_SESSION_KEY);

	logger.info(
		`Impersonation: user ${realUserId} stopped impersonating user ${impersonatedUserId}`,
	);

	session.unset(IMPERSONATED_SESSION_KEY);

	throw redirect(ADMIN_PAGE, {
		headers: { "Set-Cookie": await authSessionStorage.commitSession(session) },
	});
};

// below is alternative log-in flow that is operated via the Lohi Discord bot
// this is intended primarily as a workaround when website is having problems communicating
// with the Discord due to rate limits or other reasons

// only light validation here as we generally trust Lohi
const createLogInLinkActionSchema = z.object({
	discordId: z.string(),
	discordAvatar: z.string().nullish(),
	discordName: z.string(),
	discordUniqueName: z.string(),
	updateOnly: z.enum(["true", "false"]),
});

export const createLogInLinkAction: ActionFunction = async ({ request }) => {
	const data = parseSearchParams({
		request,
		schema: createLogInLinkActionSchema,
	});

	if (!canAccessLohiEndpoint(request)) {
		throw new Response(null, { status: 403 });
	}

	const user = await UserRepository.upsert({
		discordAvatar: data.discordAvatar ?? null,
		discordId: data.discordId,
		discordName: data.discordName,
		discordUniqueName: data.discordUniqueName,
	});

	if (data.updateOnly === "true") return null;

	const createdLink = await LogInLinkRepository.create(user.id);

	return {
		code: createdLink.code,
	};
};

const logInViaLinkActionSchema = z.object({
	code: z.string(),
});

export const logInViaLinkLoader: LoaderFunction = async ({ request }) => {
	// make sure Discord link preview doesn't consume the login link
	const userAgent = request.headers.get("user-agent");
	if (userAgent && isbot(userAgent)) {
		return null;
	}

	const data = parseSearchParams({
		request,
		schema: logInViaLinkActionSchema,
	});
	const user = getUser();

	if (user) {
		throw redirect("/");
	}

	const result = await LogInLinkRepository.findValidByCode(data.code);
	if (!result) {
		throw new Response("Invalid log in link", { status: 400 });
	}
	const userId = result.userId;

	const session = await authSessionStorage.getSession(
		request.headers.get("Cookie"),
	);

	session.set(SESSION_KEY, userId);

	await LogInLinkRepository.del(data.code);

	throw redirect("/", {
		headers: { "Set-Cookie": await authSessionStorage.commitSession(session) },
	});
};

function classifyAuthError(error: Error): AuthErrorCode {
	const message = error.message;

	if (
		message.includes("rate limited") ||
		("status" in error && error.status === 429)
	) {
		return "discordOverloaded";
	}

	if (message === "Unverified user") {
		return "unverifiedEmail";
	}

	if (message.includes("Missing state")) {
		return "browserPrivacy";
	}

	return "unknown";
}
