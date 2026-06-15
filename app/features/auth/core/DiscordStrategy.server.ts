import { add } from "date-fns";
import { OAuth2Strategy } from "remix-auth-oauth2";
import { z } from "zod";
import { Config } from "~/config";
import { ServerConfig } from "~/config.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { logger } from "~/utils/logger";

let discordApiCooldownUntil: number | null = null;

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
const discordRateLimitSchema = z.object({
	retry_after: z.number(),
});

export const DiscordStrategy = () => {
	const jsonIfOk = async (res: Response) => {
		if (res.status === 429) {
			const body = discordRateLimitSchema.safeParse(await res.clone().json());
			const retryAfterSeconds = body.success ? body.data.retry_after : 60;
			discordApiCooldownUntil = add(new Date(), {
				seconds: retryAfterSeconds,
			}).getTime();
			logger.warn(
				`Discord API rate limited, cooldown for ${retryAfterSeconds}s${body.success ? "" : " (failed to parse retry_after)"}`,
			);
		}

		if (!res.ok) {
			throw new Error(
				`Auth related call failed with status code ${res.status}`,
			);
		}

		return res.json();
	};

	const fetchProfileViaDiscordApi = (token: string) => {
		if (discordApiCooldownUntil && Date.now() < discordApiCooldownUntil) {
			throw new Error("Discord API is rate limited");
		}

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

	return new OAuth2Strategy(
		{
			clientId: ServerConfig.discord.clientId,
			clientSecret: ServerConfig.discord.clientSecret,

			authorizationEndpoint: "https://discord.com/api/oauth2/authorize",
			tokenEndpoint: "https://discord.com/api/oauth2/token",
			redirectURI: new URL("/auth/callback", Config.siteDomain).toString(),

			scopes: ["identify", "connections", "email"],
		},
		async ({ tokens }) => {
			try {
				const discordResponses = await fetchProfileViaDiscordApi(
					tokens.accessToken(),
				);

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
				logger.error("Failed to finish authentication:\n", e);
				throw e;
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
