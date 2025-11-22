import type { LoaderFunctionArgs } from "@remix-run/node";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { logger } from "~/utils/logger";
import * as DiscordAPI from "../core/DiscordAPI.server";
import { updateUserDiscordMetadata } from "../core/metadata.server";
import * as DiscordTokenRepository from "../DiscordTokenRepository.server";
import { clientStateCookie } from "../discord-utils.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const url = new URL(request.url);
	const discordState = url.searchParams.get("state");

	const cookieHeader = request.headers.get("Cookie");
	const clientState = await clientStateCookie.parse(cookieHeader);
	if (clientState !== discordState) {
		logger.error("State verification failed.");
		return new Response(null, { status: 403 });
	}

	const code = url.searchParams.get("code");
	if (!code) {
		logger.error("No code provided in OAuth callback.");
		return new Response(null, { status: 400 });
	}

	const tokens = await DiscordAPI.getOAuthTokens(code);
	const meData = await DiscordAPI.getUserData(tokens);

	const token = await DiscordTokenRepository.upsert({
		discordId: meData.user.id,
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token,
		expiresAt: dateToDatabaseTimestamp(
			new Date(Date.now() + tokens.expires_in * 1000),
		),
	});

	await updateUserDiscordMetadata(token.userId);

	return new Response("Successfully linked. You can now close this page.", {
		status: 200,
		headers: {
			"Content-Type": "text/plain",
		},
	});
};
