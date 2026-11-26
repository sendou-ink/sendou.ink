/**
 * Log in with Discord: the OAuth flow asking for the user's profile and connections, and creating
 * or updating the sendou.ink user from them.
 */
import { add } from "date-fns";
import * as v from "valibot";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { logger } from "~/utils/logger";
import * as DiscordAvatar from "./DiscordAvatar.server";
import * as DiscordOAuth from "./DiscordOAuth.server";

const LOG_IN_FLOW: DiscordOAuth.Flow = {
	scopes: ["identify", "connections", "email"],
	callbackPath: "/auth/callback",
	pkce: true,
	stateCookie: { name: "oauth2", path: "/" },
};

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

/**
 * Starts the log in flow, see {@link DiscordOAuth.authorizationRedirect}. A refresh passes
 * `prompt: "none"` so users who already authorized the app skip the consent screen.
 */
export function authorizationRedirect(options?: { prompt?: "none" }) {
	return DiscordOAuth.authorizationRedirect(LOG_IN_FLOW, options);
}

/** Finishes the log in flow on its callback and fetches the user's Discord profile with the tokens. */
export async function authenticate(request: Request): Promise<DiscordProfile> {
	const tokens = await DiscordOAuth.exchangeCode(request, LOG_IN_FLOW);

	try {
		const [user, connections] = v.parse(
			discordUserDetailsSchema,
			await fetchProfileViaDiscordApi(tokens.accessToken),
		);

		return { user, connections };
	} catch (e) {
		logger.error("Failed to finish authentication:\n", e);
		throw e;
	}
}

export type DiscordProfile = {
	user: v.InferOutput<typeof partialDiscordUserSchema>;
	connections: v.InferOutput<typeof partialDiscordConnectionsSchema>;
};

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
		defaultName: user.global_name ?? user.username,
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

async function jsonIfOk(res: Response) {
	if (res.status === 429) {
		const body = v.safeParse(discordRateLimitSchema, await res.clone().json());
		const retryAfterSeconds = body.success ? body.output.retry_after : 60;
		discordApiCooldownUntil = add(new Date(), {
			seconds: retryAfterSeconds,
		}).getTime();
		logger.warn(
			`Discord API rate limited, cooldown for ${retryAfterSeconds}s${body.success ? "" : " (failed to parse retry_after)"}`,
		);
	}

	if (!res.ok) {
		throw new Error(`Auth related call failed with status code ${res.status}`);
	}

	return res.json();
}

function fetchProfileViaDiscordApi(token: string) {
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
}
