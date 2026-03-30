import { logger } from "~/utils/logger";
import { getToken, purgeCachedToken } from "./token";
import { getTwitchEnvVars } from "./utils";

export async function twitchFetch(
	url: string,
	isRetry = false,
): Promise<Response> {
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
		return twitchFetch(url, true);
	}

	if (res.status === 429) {
		const resetHeader = res.headers.get("Ratelimit-Reset");
		const resetTimestamp = resetHeader ? Number(resetHeader) : 0;
		const waitMs = Math.max(resetTimestamp * 1000 - Date.now(), 1000);

		logger.warn(`Twitch rate limited, waiting ${Math.ceil(waitMs / 1000)}s`);
		await new Promise((resolve) => setTimeout(resolve, waitMs));

		return twitchFetch(url);
	}

	if (!res.ok) {
		throw new Error(`Twitch API request failed with status: ${res.status}`);
	}

	return res;
}
