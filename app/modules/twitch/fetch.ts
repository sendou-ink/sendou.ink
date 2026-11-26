import { logger } from "~/utils/logger";
import { getToken, purgeCachedToken } from "./token";
import { getTwitchEnvVars } from "./utils.server";

const MAX_RATE_LIMIT_RETRIES = 5;
const MAX_RATE_LIMIT_WAIT_MS = 60_000;

interface TwitchFetchOptions {
	/** Throw on a 429 straight away instead of waiting for the rate limit to reset. */
	failOnRateLimit?: boolean;
	/** Return a 404 response instead of throwing. */
	allowNotFound?: boolean;
	isRetry?: boolean;
	rateLimitRetries?: number;
}

export async function twitchFetch(
	url: string,
	options: TwitchFetchOptions = {},
): Promise<Response> {
	const { isRetry = false, rateLimitRetries = 0 } = options;
	const { TWITCH_CLIENT_ID } = getTwitchEnvVars();
	const token = await getToken();

	const res = await fetch(url, {
		headers: [
			["Authorization", `Bearer ${token}`],
			["Client-Id", TWITCH_CLIENT_ID],
		],
	});

	if (res.status === 401 && !isRetry) {
		purgeCachedToken();
		return twitchFetch(url, { ...options, isRetry: true });
	}

	if (res.status === 429) {
		if (options.failOnRateLimit) {
			throw new Error("Twitch API rate limited");
		}

		if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
			throw new Error(
				`Twitch API rate limited after ${MAX_RATE_LIMIT_RETRIES} retries`,
			);
		}

		const resetHeader = res.headers.get("Ratelimit-Reset");
		const resetTimestamp = resetHeader ? Number(resetHeader) : 0;
		const waitMs = Math.max(resetTimestamp * 1000 - Date.now(), 1000);

		if (waitMs > MAX_RATE_LIMIT_WAIT_MS) {
			throw new Error(
				`Twitch API rate limit reset too far in the future (${Math.ceil(waitMs / 1000)}s)`,
			);
		}

		logger.warn(`Twitch rate limited, waiting ${Math.ceil(waitMs / 1000)}s`);
		await new Promise((resolve) => setTimeout(resolve, waitMs));

		return twitchFetch(url, {
			...options,
			rateLimitRetries: rateLimitRetries + 1,
		});
	}

	if (res.status === 404 && options.allowNotFound) {
		return res;
	}

	if (!res.ok) {
		throw new Error(`Twitch API request failed with status: ${res.status}`);
	}

	return res;
}
