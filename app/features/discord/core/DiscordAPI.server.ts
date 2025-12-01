import { isPast } from "date-fns";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import invariant from "~/utils/invariant";
import * as DiscordTokenRepository from "../DiscordTokenRepository.server";
import {
	oAuthTokensSchema,
	type RawDiscordTokens,
	userDataSchema,
} from "../discord-schemas";
import type { SendouInkDiscordMetadata } from "../discord-types";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI!;

export function getOAuthUrl() {
	const state = crypto.randomUUID();

	const url = new URL("https://discord.com/api/oauth2/authorize");
	url.searchParams.set("client_id", DISCORD_CLIENT_ID);
	url.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("state", state);
	url.searchParams.set("scope", "role_connections.write identify");
	url.searchParams.set("prompt", "consent");

	return { url: url.toString(), state };
}

/**
 * Given an OAuth2 code from the scope approval page, make a request to Discord's
 * OAuth2 service to retrieve an access token, refresh token, and expiration.
 */
export async function getOAuthTokens(code: string) {
	const url = "https://discord.com/api/v10/oauth2/token";
	const body = new URLSearchParams({
		client_id: DISCORD_CLIENT_ID,
		client_secret: DISCORD_CLIENT_SECRET,
		grant_type: "authorization_code",
		code,
		redirect_uri: DISCORD_REDIRECT_URI,
	});

	const response = await fetch(url, {
		body,
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
	});
	if (!response.ok) {
		throw new Error(
			`Error fetching OAuth tokens: [${response.status}] ${response.statusText}`,
		);
	}

	const data = await response.json();
	return oAuthTokensSchema.parse(data);
}

/**
 * Given a user based access token, fetch profile information for the current user.
 */
export async function getUserData(tokens: RawDiscordTokens) {
	const url = "https://discord.com/api/v10/oauth2/@me";
	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${tokens.access_token}`,
		},
	});
	if (!response.ok) {
		throw new Error(
			`Error fetching user data: [${response.status}] ${response.statusText}`,
		);
	}

	const data = await response.json();
	return userDataSchema.parse(data);
}

export async function pushMetadata(
	user: { username: string; id: number },
	metadata: SendouInkDiscordMetadata,
) {
	const accessToken = await getAccessToken(user.id);

	const url = `https://discord.com/api/v10/users/@me/applications/${DISCORD_CLIENT_ID}/role-connection`;
	const body = {
		platform_username: user.username,
		metadata,
	};
	const response = await fetch(url, {
		method: "PUT",
		body: JSON.stringify(body),
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
	});
	if (!response.ok) {
		throw new Error(
			`Error pushing discord metadata: [${response.status}] ${response.statusText}: ${await response.text()}`,
		);
	}
}

export async function getAccessToken(userId: number) {
	const tokens = await DiscordTokenRepository.findByUserId(userId);

	// user has not connected to sendou.ink on Discord
	if (!tokens) return;

	if (isPast(databaseTimestampToDate(tokens.expiresAt))) {
		const url = "https://discord.com/api/v10/oauth2/token";
		const body = new URLSearchParams({
			client_id: DISCORD_CLIENT_ID,
			client_secret: DISCORD_CLIENT_SECRET,
			grant_type: "refresh_token",
			refresh_token: tokens.refreshToken,
		});
		const response = await fetch(url, {
			body,
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
		});
		if (response.ok) {
			const discordId = (await UserRepository.findLeanById(userId))?.discordId;
			invariant(discordId, "Discord ID not found for user");

			const rawTokens = await response.json();
			const tokens = oAuthTokensSchema.parse(rawTokens);

			await DiscordTokenRepository.upsert({
				discordId,
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				expiresAt: dateToDatabaseTimestamp(
					new Date(Date.now() + tokens.expires_in * 1000),
				),
			});
			return tokens.access_token;
		}

		throw new Error(
			`Error refreshing access token: [${response.status}] ${response.statusText}: ${await response.text()}`,
		);
	}

	return tokens.accessToken;
}
