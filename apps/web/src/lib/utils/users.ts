import { logger } from "@sendou/utils/logger";

const DISCORD_ID_MIN_LENGTH = 17;

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
