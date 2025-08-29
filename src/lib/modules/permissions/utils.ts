import { ADMIN_ID, DISCORD_ID_MIN_LENGTH, STAFF_IDS } from '$lib/constants/common';
import type { EntityWithPermissions } from '$lib/modules/permissions/types';
import type { AuthenticatedUser } from '$lib/server/auth/session';
import { logger } from '$lib/utils/logger';

export function isAdmin(user?: { id: number }) {
	return user?.id === ADMIN_ID;
}

export function isStaff(user?: { id: number }) {
	if (!user) return false;

	return STAFF_IDS.includes(user.id);
}

export function isSupporter(user?: { patronTier: number | null }) {
	return typeof user?.patronTier === 'number' && user.patronTier >= 2;
}

// snowflake logic from https://github.dev/vegeta897/snow-stamp/blob/main/src/util.js
const DISCORD_EPOCH = 1420070400000;

// Converts a snowflake ID string into a JS Date object using the provided epoch (in ms), or Discord's epoch if not provided
export function convertSnowflakeToDate(snowflake: string) {
	// Convert snowflake to BigInt to extract timestamp bits
	// https://discord.com/developers/docs/reference#snowflakes
	const milliseconds = BigInt(snowflake) >> 22n;
	return new Date(Number(milliseconds) + DISCORD_EPOCH);
}

const AGED_CRITERIA = 1000 * 60 * 60 * 24 * 30 * 3; // 3 months
export function userDiscordIdIsAged(user: { discordId: string }) {
	if (!user.discordId || user.discordId.length < DISCORD_ID_MIN_LENGTH) {
		logger.error('Invalid or missing discord id', {
			discordId: user.discordId
		});

		return false;
	}

	const timestamp = convertSnowflakeToDate(user.discordId).getTime();

	return Date.now() - timestamp > AGED_CRITERIA;
}

export function accountCreatedInTheLastSixMonths(discordId: string) {
	const timestamp = convertSnowflakeToDate(discordId).getTime();

	return Date.now() - timestamp < 1000 * 60 * 60 * 24 * 30 * 6;
}

/**
 * Determines whether a user has a specific permission for a given entity.
 *
 * @returns A boolean indicating whether the user has the specified permission. Always false if user is not logged in.
 */
export function hasPermission<T extends EntityWithPermissions, K extends keyof T['permissions']>(
	obj: T,
	permission: K,
	user: AuthenticatedUser | undefined
) {
	if (!user) return false;

	// xxx: uncomment this
	// admin can do anything in production but not in development for better testing
	if (/*process.env.NODE_ENV === 'production' && */ isAdmin(user)) {
		return true;
	}

	return (obj.permissions as Record<K, number[]>)[permission].includes(user.id);
}
