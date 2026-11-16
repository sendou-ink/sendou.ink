import { setTimeout as sleep } from "node:timers/promises";
import { OAuth2RequestError, OAuth2Strategy } from "remix-auth-oauth2";
import * as v from "valibot";
import { Config } from "~/config";
import { ServerConfig } from "~/config.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import { logger } from "~/utils/logger";
import { LINKED_ROLE_CALLBACK_URL } from "../discord-constants";
import type { SendouInkDiscordMetadata } from "../discord-types";

const API_URL = "https://discord.com/api/v10";
const MAX_RATE_LIMIT_RETRIES = 3;

export type DiscordTokens = OAuth2Strategy.VerifyOptions["tokens"];

/**
 * OAuth flow of the linked role verification URL. Separate from log in: it asks for the
 * `role_connections.write` scope and the tokens are stored to update the metadata later.
 */
export const linkedRoleStrategy = new OAuth2Strategy<DiscordTokens>(
	{
		clientId: ServerConfig.discord.clientId,
		clientSecret: ServerConfig.discord.clientSecret,

		authorizationEndpoint: "https://discord.com/api/oauth2/authorize",
		tokenEndpoint: `${API_URL}/oauth2/token`,
		redirectURI: new URL(LINKED_ROLE_CALLBACK_URL, Config.siteDomain),

		scopes: ["identify", "role_connections.write"],
		cookie: {
			name: "discord_linked_role",
			path: "/discord",
			secure: (ServerConfig.isProduction && !IS_E2E_TEST_RUN) || undefined,
		},
	},
	async ({ tokens }) => tokens,
);

const userSchema = v.object({ id: v.string() });
const rateLimitSchema = v.object({ retry_after: v.number() });

/** Discord id of the user the access token belongs to. */
export async function fetchUserId(accessToken: string) {
	const response = await fetch(`${API_URL}/users/@me`, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (!response.ok) {
		throw new Error(
			`Fetching Discord user failed: [${response.status}] ${await response.text()}`,
		);
	}

	return v.parse(userSchema, await response.json()).id;
}

/** New tokens for the refresh token, `null` if Discord no longer accepts it (e.g. the user deauthorized the app). */
export async function refreshTokens(
	refreshToken: string,
): Promise<DiscordTokens | null> {
	try {
		return await linkedRoleStrategy.refreshToken(refreshToken);
	} catch (error) {
		if (error instanceof OAuth2RequestError && error.code === "invalid_grant") {
			return null;
		}

		throw error;
	}
}

/**
 * Replaces the user's linked role metadata. Waits out rate limits. Resolves to `"UNAUTHORIZED"`
 * if Discord no longer accepts the access token.
 */
export async function putRoleConnection({
	accessToken,
	platformUsername,
	metadata,
}: {
	accessToken: string;
	platformUsername: string;
	metadata: SendouInkDiscordMetadata;
}): Promise<"OK" | "UNAUTHORIZED"> {
	for (let attempt = 0; ; attempt++) {
		const response = await fetch(
			`${API_URL}/users/@me/applications/${ServerConfig.discord.clientId}/role-connection`,
			{
				method: "PUT",
				body: JSON.stringify({ platform_username: platformUsername, metadata }),
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
			},
		);

		if (response.ok) return "OK";
		if (response.status === 401) return "UNAUTHORIZED";

		if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
			const retryAfterSeconds = await retryAfter(response);
			logger.warn(
				`Discord role connection rate limited, retrying in ${retryAfterSeconds}s`,
			);
			await sleep(retryAfterSeconds * 1000);
			continue;
		}

		throw new Error(
			`Pushing Discord role connection failed: [${response.status}] ${await response.text()}`,
		);
	}
}

async function retryAfter(response: Response) {
	const body = v.safeParse(
		rateLimitSchema,
		await response.json().catch(() => null),
	);

	return body.success ? body.output.retry_after : 60;
}
