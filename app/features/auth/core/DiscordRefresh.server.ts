import { createCookie } from "react-router";
import { ServerConfig } from "~/config.server";
import { LRUCache } from "~/modules/cache";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";

const COOLDOWN_MS = 10 * 60 * 1000;
const FLAG_MAX_AGE_SECONDS = 10 * 60;

const flagCookie = createCookie("discord_refresh", {
	sameSite: "lax",
	path: "/auth",
	httpOnly: true,
	secrets: [ServerConfig.sessionSecret],
	secure: ServerConfig.isProduction && !IS_E2E_TEST_RUN,
	maxAge: FLAG_MAX_AGE_SECONDS,
});

const lastRefreshedAt = new LRUCache<number, number>({ max: 10_000 });

/**
 * `Set-Cookie` value marking the next OAuth callback as a profile refresh of the given user
 * instead of a log in.
 */
export function flagCookieHeader(userId: number) {
	return flagCookie.serialize(userId);
}

export function clearFlagCookieHeader() {
	return flagCookie.serialize("", { maxAge: 0 });
}

/** The id of the user who started a profile refresh, or `null` if the OAuth flow is a regular log in. */
export async function flaggedUserId(request: Request): Promise<number | null> {
	const value = await flagCookie.parse(request.headers.get("Cookie"));

	return typeof value === "number" ? value : null;
}

/** Whether the user refreshed recently. Each refresh costs Discord API calls shared with log in's rate limit. */
export function isOnCooldown(userId: number) {
	const refreshedAt = lastRefreshedAt.get(userId);

	return refreshedAt !== undefined && Date.now() - refreshedAt < COOLDOWN_MS;
}

export function startCooldown(userId: number) {
	lastRefreshedAt.set(userId, Date.now());
}
