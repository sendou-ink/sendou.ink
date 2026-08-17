import { logger } from "@sendou/utils/logger";
import { isCustomUrl } from "#lib/utils/urls.ts";

const DISCORD_ID_MIN_LENGTH = 17;

const longUrlRegExp = /(https:\/\/)?sendou\.ink\/u\/([^/?#]+)/;
const shortUrlRegExp = /(https:\/\/)?snd\.ink\/([^/?#]+)/;

/** Resolves a search query into the user identifier it contains (profile URL, discord id or numeric id), or `null` when it is a plain text query. */
export function queryToUserIdentifier(
	query: string,
): { id: number } | { discordId: string } | { customUrl: string } | null {
	const longUrlMatch = query.match(longUrlRegExp);
	const shortUrlMatch = query.match(shortUrlRegExp);

	if (longUrlMatch || shortUrlMatch) {
		const [, , identifier] = (longUrlMatch ?? shortUrlMatch)!;

		if (isCustomUrl(identifier)) {
			return { customUrl: identifier };
		}

		if (identifier.length >= DISCORD_ID_MIN_LENGTH) {
			return { discordId: identifier };
		}

		return { id: Number(identifier) };
	}

	// = it's numeric
	if (!isCustomUrl(query)) {
		if (query.length >= DISCORD_ID_MIN_LENGTH) {
			return { discordId: query };
		}

		return { id: Number(query) };
	}

	return null;
}

// snowflake logic from https://github.dev/vegeta897/snow-stamp/blob/main/src/util.js
const DISCORD_EPOCH = 1420070400000;

/** Converts a Discord snowflake ID string into the `Date` it encodes. */
export function convertSnowflakeToDate(snowflake: string) {
	const milliseconds = BigInt(snowflake) >> 22n;
	return new Date(Number(milliseconds) + DISCORD_EPOCH);
}

const AGED_CRITERIA = 1000 * 60 * 60 * 24 * 30 * 3; // 3 months

/** Whether the user's Discord account is old enough to unlock features gated on account age. */
export function userDiscordIdIsAged(user: { discordId: string }) {
	if (!user.discordId || user.discordId.length < DISCORD_ID_MIN_LENGTH) {
		logger.error("Invalid or missing discord id", {
			discordId: user.discordId,
		});

		return false;
	}

	const timestamp = convertSnowflakeToDate(user.discordId).getTime();

	return Date.now() - timestamp > AGED_CRITERIA;
}
