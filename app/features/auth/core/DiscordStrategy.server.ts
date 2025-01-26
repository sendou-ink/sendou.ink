import { OAuth2Strategy } from "remix-auth-oauth2";
import { z } from "zod";
import type { User } from "~/db/types";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

export type LoggedInUser = User["id"];

const partialDiscordUserSchema = z.object({
	avatar: z.string().nullish(),
	discriminator: z.string(),
	id: z.string(),
	username: z.string(),
	global_name: z.string().nullish(),
	verified: z.boolean().nullish(),
});
const partialDiscordConnectionsSchema = z.array(
	z.object({
		visibility: z.number(),
		verified: z.boolean(),
		name: z.string(),
		id: z.string(),
		type: z.string(),
	}),
);
const discordUserDetailsSchema = z.tuple([
	partialDiscordUserSchema,
	partialDiscordConnectionsSchema,
]);

export const DiscordStrategy = () => {
	const envVars = authEnvVars();

	const authGatewayEnabled = () => {
		return Boolean(process.env.AUTH_GATEWAY_TOKEN_URL);
	};

	const jsonIfOk = (res: Response) => {
		if (!res.ok) {
			throw new Error(
				`Auth related call failed with status code ${res.status}`,
			);
		}

		return res.json();
	};

	const fetchProfileViaDiscordApi = (token: string) => {
		const authHeader: [string, string] = ["Authorization", `Bearer ${token}`];

		return Promise.all([
			fetch("https://discord.com/api/users/@me", {
				headers: [authHeader],
			}).then(jsonIfOk),
			fetch("https://discord.com/api/users/@me/connections", {
				headers: [authHeader],
			}).then(jsonIfOk),
		]);
	};

	const fetchProfileViaGateway = (token: string) => {
		const url = `${process.env.AUTH_GATEWAY_PROFILE_URL}?token=${token}`;

		return fetch(url).then(jsonIfOk);
	};

	return new OAuth2Strategy(
		{
			clientId: envVars.DISCORD_CLIENT_ID,
			clientSecret: envVars.DISCORD_CLIENT_SECRET,

			authorizationEndpoint: "https://discord.com/api/oauth2/authorize",
			tokenEndpoint:
				process.env.AUTH_GATEWAY_TOKEN_URL ||
				"https://discord.com/api/oauth2/token",
			redirectURI: new URL("/auth/callback", envVars.BASE_URL).toString(),

			scopes: ["identify", "connections", "email"],
		},
		async ({ tokens }) => {
			try {
				const discordResponses = authGatewayEnabled()
					? await fetchProfileViaGateway(tokens.accessToken())
					: await fetchProfileViaDiscordApi(tokens.accessToken());

				const [user, connections] =
					discordUserDetailsSchema.parse(discordResponses);

				const isAlreadyRegistered = Boolean(
					await UserRepository.identifierToUserId(user.id),
				);

				if (!isAlreadyRegistered && !user.verified) {
					logger.info(`User is not verified with id: ${user.id}`);
					throw new Error("Unverified user");
				}

				const userFromDb = await UserRepository.upsert({
					discordAvatar: user.avatar ?? null,
					discordId: user.id,
					discordName: user.global_name ?? user.username,
					discordUniqueName: user.global_name ? user.username : null,
					...parseConnections(connections),
				});

				return userFromDb.id;
			} catch (e) {
				console.error("Failed to finish authentication:\n", e);
				throw new Error("Failed to finish authentication");
			}
		},
	);
};

function parseConnections(
	connections: z.infer<typeof partialDiscordConnectionsSchema>,
) {
	if (!connections) throw new Error("No connections");

	const result: {
		twitch: string | null;
		youtubeId: string | null;
		bsky: string | null;
	} = {
		twitch: null,
		youtubeId: null,
		bsky: null,
	};

	for (const connection of connections) {
		if (connection.visibility !== 1 || !connection.verified) continue;

		switch (connection.type) {
			case "twitch":
				result.twitch = connection.name;
				break;
			case "youtube":
				result.youtubeId = connection.id;
				break;
			case "bluesky":
				result.bsky = connection.name;
		}
	}

	return result;
}

function authEnvVars() {
	if (process.env.NODE_ENV === "production") {
		invariant(process.env.DISCORD_CLIENT_ID);
		invariant(process.env.DISCORD_CLIENT_SECRET);
		invariant(import.meta.env.VITE_SITE_DOMAIN);

		return {
			DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
			DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
			BASE_URL: import.meta.env.VITE_SITE_DOMAIN,
		};
	}

	// allow running the project in development without setting auth env vars
	return {
		DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID ?? "",
		DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET ?? "",
		BASE_URL: import.meta.env.VITE_SITE_DOMAIN ?? "",
	};
}
