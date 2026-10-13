import { add } from "date-fns";
import { OAuth2Strategy } from "remix-auth-oauth2";
import * as v from "valibot";
import { Config } from "~/config";
import { ServerConfig } from "~/config.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { logger } from "~/utils/logger";
import { DISCORD_REFRESH_URL } from "~/utils/urls";
import * as DiscordAvatar from "./DiscordAvatar.server";

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

	return new DiscordOAuth2Strategy(
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

				return { user, connections };
			} catch (e) {
				logger.error("Failed to finish authentication:\n", e);
				throw e;
			}
		},
	);
};

export type DiscordProfile = {
	user: v.InferOutput<typeof partialDiscordUserSchema>;
	connections: v.InferOutput<typeof partialDiscordConnectionsSchema>;
};

class DiscordOAuth2Strategy extends OAuth2Strategy<DiscordProfile> {
	protected override authorizationParams(
		params: URLSearchParams,
		request: Request,
	) {
		const result = new URLSearchParams(params);
		// already authorized users skip the consent screen
		if (new URL(request.url).pathname === DISCORD_REFRESH_URL) {
			result.set("prompt", "none");
		}

		return result;
	}
}

/**
 * Creates or updates the user (name, avatar, connections) from their Discord profile and returns
 * their id. Unverified Discord accounts can't register.
 */
export async function upsertUser({ user, connections }: DiscordProfile) {
	const isAlreadyRegistered = Boolean(
		await UserRepository.findIdByIdentifier(user.id),
	);

	if (!isAlreadyRegistered && !user.verified) {
		logger.info(`User is not verified with id: ${user.id}`);
		throw new Error("Unverified user");
	}

	const userFromDb = await UserRepository.upsert({
		discordId: user.id,
		discordName: user.global_name ?? user.username,
		discordUniqueName: user.global_name ? user.username : null,
		...parseConnections(connections),
	});

	await DiscordAvatar.syncForUser({
		user: userFromDb,
		discordId: user.id,
		newHash: user.avatar ?? null,
	});

	return userFromDb.id;
}

function parseConnections(
	connections: v.InferOutput<typeof partialDiscordConnectionsSchema>,
) {
	if (!connections) throw new Error("No connections");

	const result: {
		twitch: string | null;
		youtubeId: string | null;
		youtubeName: string | null;
		bsky: string | null;
	} = {
		twitch: null,
		youtubeId: null,
		youtubeName: null,
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
				result.youtubeName = connection.name;
				break;
			case "bluesky":
				result.bsky = connection.name;
		}
	}

	return result;
}
