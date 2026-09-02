import { isbot } from "isbot";
import type { ActionFunction, LoaderFunction } from "react-router";
import { redirect } from "react-router";
import * as v from "valibot";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { isAdmin, isStaff } from "~/modules/permissions/utils";
import { logger } from "~/utils/logger";
import {
	canAccessLohiEndpoint,
	errorToastRedirect,
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

export const logOutAction: ActionFunction = async ({ request }) => {
	const session = await authSessionStorage.getSession(
		request.headers.get(SESSION_KEY),
	);
	return redirect("/", {
		headers: { "Set-Cookie": await authSessionStorage.destroySession(session) },
	});
};

export const logInAction: ActionFunction = async ({ request }) => {
	return await authenticator.authenticate("discord", request);
};

export const impersonateAction: ActionFunction = async ({ request, url }) => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		const user = requireUser();
		if (!user.roles.includes("ADMIN") && !user.roles.includes("DEV")) {
			throw new Response("Forbidden", { status: 403 });
		}

		if (user.roles.includes("DEV") && !user.roles.includes("ADMIN")) {
			// biome-ignore lint/plugin: a missing or malformed `id` must 400, not fall back to a default
			const targetId = Number(url.searchParams.get("id"));
			if (isAdmin({ id: targetId }) || isStaff({ id: targetId })) {
				throw new Response("Forbidden", { status: 403 });
			}
		}
	}

	const returnTo = await safeReturnTo(request);

	const session = await authSessionStorage.getSession(
		request.headers.get("Cookie"),
	);

	const realUserId = session.get(SESSION_KEY);

	// biome-ignore-start lint/plugin: a missing or malformed `id` must 400, not fall back to a default
	const rawId = url.searchParams.get("id");

	const userId = Number(url.searchParams.get("id"));
	// biome-ignore-end lint/plugin: a missing or malformed `id` must 400, not fall back to a default
	if (!rawId || Number.isNaN(userId)) throw new Response(null, { status: 400 });

	logger.info(
		`Impersonation: user ${realUserId} started impersonating user ${userId}`,
	);

	session.set(IMPERSONATED_SESSION_KEY, userId);

	throw redirect(returnTo ?? ADMIN_PAGE, {
		headers: { "Set-Cookie": await authSessionStorage.commitSession(session) },
	});
};

export const stopImpersonatingAction: ActionFunction = async ({ request }) => {
	const returnTo = await safeReturnTo(request);

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
		headers: { "Set-Cookie": await authSessionStorage.commitSession(session) },
	});
};

async function safeReturnTo(request: Request): Promise<string | null> {
	if (!request.headers.get("Content-Type")?.includes("form")) return null;

	const value = (await request.formData()).get("returnTo");
	if (typeof value !== "string") return null;
	if (!value.startsWith("/") || value.startsWith("//")) return null;

	return value;
}

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

	const createdLink = await LogInLinkRepository.insert(user.id);

	return {
		code: createdLink.code,
	};
};

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
		throw new Response("Invalid log in link", { status: 400 });
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
