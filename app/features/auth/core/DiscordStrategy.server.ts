import { add } from "date-fns";
import { OAuth2Strategy } from "remix-auth-oauth2";
import * as v from "valibot";
import { Config } from "~/config";
import { ServerConfig } from "~/config.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { logger } from "~/utils/logger";

let discordApiCooldownUntil: number | null = null;

const partialDiscordUserSchema = v.object({
	avatar: v.optional(v.nullable(v.string())),
	discriminator: v.string(),
	id: v.string(),
	username: v.string(),
	global_name: v.optional(v.nullable(v.string())),
	verified: v.optional(v.nullable(v.boolean())),
});
const partialDiscordConnectionsSchema = v.array(
	v.object({
		visibility: v.number(),
		verified: v.boolean(),
		name: v.string(),
		id: v.string(),
		type: v.string(),
	}),
);
const discordUserDetailsSchema = v.tuple([
	partialDiscordUserSchema,
	partialDiscordConnectionsSchema,
]);
const discordRateLimitSchema = v.object({
	retry_after: v.number(),
});

export const DiscordStrategy = () => {
	const jsonIfOk = async (res: Response) => {
		if (res.status === 429) {
			const body = v.safeParse(
				discordRateLimitSchema,
				await res.clone().json(),
			);
			const retryAfterSeconds = body.success ? body.output.retry_after : 60;
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

				const [user, connections] = v.parse(
					discordUserDetailsSchema,
					discordResponses,
				);

				const isAlreadyRegistered = Boolean(
					await UserRepository.findIdByIdentifier(user.id),
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
	connections: v.InferOutput<typeof partialDiscordConnectionsSchema>,
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
