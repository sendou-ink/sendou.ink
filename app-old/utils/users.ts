import type { User } from "~/db/types";
import { isAdmin } from "~/permissions";
import { isCustomUrl } from "./urls";

export function isAtLeastFiveDollarTierPatreon(
	user?: Pick<User, "patronTier" | "id">,
) {
	if (!user) return false;

	return isAdmin(user) || (user.patronTier && user.patronTier >= 2);
}

const longUrlRegExp = /(https:\/\/)?sendou.ink\/u\/(.+)/;
const shortUrlRegExp = /(https:\/\/)?snd.ink\/(.+)/;
const DISCORD_ID_MIN_LENGTH = 17;
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

		return { discordId: identifier };
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

// Converts a snowflake ID string into a JS Date object using the provided epoch (in ms), or Discord's epoch if not provided
function convertSnowflakeToDate(snowflake: string) {
	// Convert snowflake to BigInt to extract timestamp bits
	// https://discord.com/developers/docs/reference#snowflakes
	const milliseconds = BigInt(snowflake) >> 22n;
	return new Date(Number(milliseconds) + DISCORD_EPOCH);
}

const AGED_CRITERIA = 1000 * 60 * 60 * 24 * 30 * 3; // 3 months
export function userDiscordIdIsAged(user: { discordId: string }) {
	// types should catch this but since this is a permission related
	// code playing it safe
	if (!user.discordId) {
		throw new Error("No discord id");
	}
	if (user.discordId.length < DISCORD_ID_MIN_LENGTH) {
		throw new Error("Not a valid discord id");
	}

	const timestamp = convertSnowflakeToDate(user.discordId).getTime();

	return Date.now() - timestamp > AGED_CRITERIA;
}

export function accountCreatedInTheLastSixMonths(discordId: string) {
	const timestamp = convertSnowflakeToDate(discordId).getTime();

	return Date.now() - timestamp < 1000 * 60 * 60 * 24 * 30 * 6;
}
