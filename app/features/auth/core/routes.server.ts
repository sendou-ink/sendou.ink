import { isbot } from "isbot";
import type { LoaderFunction } from "react-router";
import { redirect } from "react-router";
import * as v from "valibot";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
import { isAdmin, isStaff } from "~/modules/permissions/utils";
import { logger } from "~/utils/logger";
import {
	badRequest,
	canAccessLohiEndpoint,
	errorToastRedirect,
	forbidden,
	safeReturnTo,
} from "~/utils/remix.server";
import type { AnySyncSchema } from "~/utils/schema";
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

export const callbackLoader: LoaderFunction = async ({ request, url }) => {
	// biome-ignore lint/plugin: OAuth callback param, its name and values defined by the provider
	if (url.searchParams.get("error") === "access_denied") {
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

export const logOutAction = defineAction(async ({ request }) => {
	const session = await authSessionStorage.getSession(
		request.headers.get(SESSION_KEY),
	);
	return redirect("/", {
		headers: { "Set-Cookie": await authSessionStorage.destroySession(session) },
	});
});

export const logInAction = defineAction(async ({ request }) => {
	return await authenticator.authenticate("discord", request);
});

const returnToSchema = v.object({
	returnTo: v.optional(v.string()),
});

export const impersonateAction = defineAction(
	{ body: returnToSchema },
	async ({ request, url, body }) => {
		if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
			const user = requireUser();
			if (!user.roles.includes("ADMIN") && !user.roles.includes("DEV")) {
				forbidden();
			}

			if (user.roles.includes("DEV") && !user.roles.includes("ADMIN")) {
				// biome-ignore lint/plugin: a missing or malformed `id` must 400, not fall back to a default
				const targetId = Number(url.searchParams.get("id"));
				if (isAdmin({ id: targetId }) || isStaff({ id: targetId })) {
					forbidden();
				}
			}
		}

		const returnTo = safeReturnTo(body.returnTo ?? null);

		const session = await authSessionStorage.getSession(
			request.headers.get("Cookie"),
		);

		const realUserId = session.get(SESSION_KEY);

		// biome-ignore-start lint/plugin: a missing or malformed `id` must 400, not fall back to a default
		const rawId = url.searchParams.get("id");

		const userId = Number(url.searchParams.get("id"));
		// biome-ignore-end lint/plugin: a missing or malformed `id` must 400, not fall back to a default
		if (!rawId || Number.isNaN(userId)) badRequest();

		logger.info(
			`Impersonation: user ${realUserId} started impersonating user ${userId}`,
		);

		session.set(IMPERSONATED_SESSION_KEY, userId);

		throw redirect(returnTo ?? ADMIN_PAGE, {
			headers: {
				"Set-Cookie": await authSessionStorage.commitSession(session),
			},
		});
	},
);

export const stopImpersonatingAction = defineAction(
	{ body: returnToSchema },
	async ({ request, body }) => {
		const returnTo = safeReturnTo(body.returnTo ?? null);

		const session = await authSessionStorage.getSession(
			request.headers.get("Cookie"),
		);

		const realUserId = session.get(SESSION_KEY);
		const impersonatedUserId = session.get(IMPERSONATED_SESSION_KEY);

		logger.info(
			`Impersonation: user ${realUserId} stopped impersonating user ${impersonatedUserId}`,
		);

		session.unset(IMPERSONATED_SESSION_KEY);

		throw redirect(returnTo ?? ADMIN_PAGE, {
			headers: {
				"Set-Cookie": await authSessionStorage.commitSession(session),
			},
		});
	},
);

// alternative log-in flow via the Lohi Discord bot, a workaround for when the site can't reach
// Discord (rate limits etc.). Only light validation as we trust Lohi; these params are
// infrastructure conventions and intentionally bypass app/modules/search-params/
function parseSearchParams<T extends AnySyncSchema>({
	request,
	schema,
}: {
	request: Request;
	schema: T;
}): v.InferOutput<T> {
	const searchParams = Object.fromEntries(new URL(request.url).searchParams);

	try {
		return v.parse(schema, searchParams);
	} catch (e) {
		logger.error("Error parsing search params", e);

		throw errorToastRedirect("Validation failed");
	}
}

const createLogInLinkActionSchema = v.object({
	discordId: v.string(),
	discordAvatar: v.optional(v.nullable(v.string())),
	discordName: v.string(),
	discordUniqueName: v.string(),
	updateOnly: v.picklist(["true", "false"]),
});

export const createLogInLinkAction = defineAction(async ({ request }) => {
	const data = parseSearchParams({
		request,
		schema: createLogInLinkActionSchema,
	});

	if (!canAccessLohiEndpoint(request)) {
		forbidden();
	}

	const user = await UserRepository.upsert({
		discordAvatar: data.discordAvatar ?? null,
		discordId: data.discordId,
		discordName: data.discordName,
		discordUniqueName: data.discordUniqueName,
	});

	if (data.updateOnly === "true") return null;

	const createdLink = await LogInLinkRepository.insert(user.id);

	return {
		code: createdLink.code,
	};
});

const logInViaLinkActionSchema = v.object({
	code: v.string(),
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
		badRequest();
	}
	const userId = result.userId;

	const session = await authSessionStorage.getSession(
		request.headers.get("Cookie"),
	);

	session.set(SESSION_KEY, userId);

	await LogInLinkRepository.deleteByCode(data.code);

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
