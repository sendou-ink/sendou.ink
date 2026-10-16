import { isbot } from "isbot";
import type { LoaderFunction } from "react-router";
import { redirect } from "react-router";
import * as v from "valibot";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
import { isAdmin, isStaff } from "~/modules/permissions/utils";
import { logger } from "~/utils/logger";
import {
	badRequest,
	canAccessLohiEndpoint,
	errorToastRedirect,
	errorToastWithRedirect,
	forbidden,
	safeReturnTo,
	successToastWithRedirect,
} from "~/utils/remix.server";
import type { AnySyncSchema } from "~/utils/schema";
import { ADMIN_PAGE, authErrorUrl, SETTINGS_PAGE } from "~/utils/urls";
import * as LogInLinkRepository from "../LogInLinkRepository.server";
import {
	authenticator,
	IMPERSONATED_SESSION_KEY,
	SESSION_KEY,
} from "./authenticator.server";
import * as DiscordAvatar from "./DiscordAvatar.server";
import * as DiscordRefresh from "./DiscordRefresh.server";
import { upsertUser } from "./DiscordStrategy.server";
import type { AuthErrorCode } from "./errors";
import { authSessionStorage } from "./session.server";
import { getUser, isImpersonating, requireUser } from "./user.server";

export const callbackLoader: LoaderFunction = async ({ request, url }) => {
	const refreshingUserId = await DiscordRefresh.flaggedUserId(request);
	if (refreshingUserId !== null) {
		return refreshCallback({ request, url, refreshingUserId });
	}

	// biome-ignore lint/plugin: OAuth callback param, its name and values defined by the provider
	if (url.searchParams.get("error") === "access_denied") {
		// https://www.oauth.com/oauth2-servers/server-side-apps/possible-errors/

		throw redirect(authErrorUrl("aborted"));
	}

	try {
		const profile = await authenticator.authenticate("discord", request);
		const userId = await upsertUser(profile);

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

export const refreshFromDiscordAction = defineAction(async ({ request }) => {
	const user = requireUser();

	if (await isImpersonating(request)) {
		throw errorToastWithRedirect({
			url: SETTINGS_PAGE,
			message: "Can't refresh from Discord while impersonating",
		});
	}

	if (DiscordRefresh.isOnCooldown(user.id)) {
		throw errorToastWithRedirect({
			url: SETTINGS_PAGE,
			message: REFRESH_COOLDOWN_MESSAGE,
		});
	}

	try {
		return await authenticator.authenticate("discord", request);
	} catch (error) {
		// starting the OAuth flow always throws the redirect to Discord
		if (error instanceof Response) {
			error.headers.append(
				"Set-Cookie",
				await DiscordRefresh.flagCookieHeader(user.id),
			);
		}

		throw error;
	}
});

export const logOutAction = defineAction(async ({ request }) => {
	const session = await authSessionStorage.getSession(
		request.headers.get(SESSION_KEY),
	);
	return redirect("/", {
		headers: { "Set-Cookie": await authSessionStorage.destroySession(session) },
	});
});

export const logInAction = defineAction(async ({ request }) => {
	try {
		return await authenticator.authenticate("discord", request);
	} catch (error) {
		// a refresh abandoned midway must not turn this log in into one
		if (error instanceof Response) {
			error.headers.append(
				"Set-Cookie",
				await DiscordRefresh.clearFlagCookieHeader(),
			);
		}

		throw error;
	}
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
	// the name & avatar sync it was used for is retired
	updateOnly: v.optional(v.picklist(["true", "false"])),
});

export const createLogInLinkAction = defineAction(async ({ request }) => {
	const data = parseSearchParams({
		request,
		schema: createLogInLinkActionSchema,
	});

	if (!canAccessLohiEndpoint(request)) {
		forbidden();
	}

	if (data.updateOnly === "true") return null;

	const user = await UserRepository.upsert({
		discordId: data.discordId,
		discordName: data.discordName,
		discordUniqueName: data.discordUniqueName,
	});

	await DiscordAvatar.syncForUser({
		user,
		discordId: data.discordId,
		newHash: data.discordAvatar ?? null,
	});

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

const REFRESH_COOLDOWN_MESSAGE =
	"You can refresh from Discord once every 10 minutes";

async function refreshCallback({
	request,
	url,
	refreshingUserId,
}: {
	request: Request;
	url: URL;
	refreshingUserId: number;
}) {
	const headers = {
		"Set-Cookie": await DiscordRefresh.clearFlagCookieHeader(),
	};
	const failed = (message: string) =>
		errorToastWithRedirect({ url: SETTINGS_PAGE, message, headers });

	// biome-ignore lint/plugin: OAuth callback param, its name and values defined by the provider
	if (url.searchParams.has("error")) {
		return failed("Refreshing from Discord was canceled");
	}

	const user = getUser();
	if (
		!user ||
		user.id !== refreshingUserId ||
		(await isImpersonating(request))
	) {
		return failed("Refreshing from Discord failed");
	}

	if (DiscordRefresh.isOnCooldown(user.id)) {
		return failed(REFRESH_COOLDOWN_MESSAGE);
	}
	DiscordRefresh.startCooldown(user.id);

	try {
		const profile = await authenticator.authenticate("discord", request);

		if (profile.user.id !== user.discordId) {
			return failed(
				"The Discord account you authorized is not the one linked to your sendou.ink account",
			);
		}

		await upsertUser(profile);
	} catch (error) {
		logger.error("Error during refresh from Discord:", error);

		return failed(
			error instanceof Error && classifyAuthError(error) === "discordOverloaded"
				? "Discord is overloaded right now, try again later"
				: "Refreshing from Discord failed",
		);
	}

	return successToastWithRedirect({
		url: SETTINGS_PAGE,
		message: "Your avatar, name and connections were refreshed from Discord",
		headers,
	});
}
