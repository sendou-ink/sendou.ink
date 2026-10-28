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

export interface FlaggedRefresh {
	userId: number;
	returnTo: string | null;
}

const lastRefreshedAt = new LRUCache<number, number>({ max: 10_000 });

/**
 * `Set-Cookie` value marking the next OAuth callback as a profile refresh of the given user
 * instead of a log in.
 */
export function flagCookieHeader(refresh: FlaggedRefresh) {
	return flagCookie.serialize(refresh);
}

export function clearFlagCookieHeader() {
	return flagCookie.serialize("", { maxAge: 0 });
}

/** The profile refresh in progress, or `null` if the OAuth flow is a regular log in. */
export async function flaggedRefresh(
	request: Request,
): Promise<FlaggedRefresh | null> {
	const value = await flagCookie.parse(request.headers.get("Cookie"));
	if (typeof value?.userId !== "number") return null;

	return {
		userId: value.userId,
		returnTo: typeof value.returnTo === "string" ? value.returnTo : null,
	};
}

/** Whether the user refreshed recently. Each refresh costs Discord API calls shared with log in's rate limit. */
export function isOnCooldown(userId: number) {
	const refreshedAt = lastRefreshedAt.get(userId);

	return refreshedAt !== undefined && Date.now() - refreshedAt < COOLDOWN_MS;
}

export function startCooldown(userId: number) {
	lastRefreshedAt.set(userId, Date.now());
}
