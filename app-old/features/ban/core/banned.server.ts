import { cache, syncCached } from "~/utils/cache.server";
import { databaseTimestampToDate } from "~/utils/dates";
import { allBannedUsers } from "../queries/allBannedUsers.server";

const BANNED_USERS_CACHE_KEY = "bannedUsers";

export function cachedBannedUsers() {
	return syncCached(BANNED_USERS_CACHE_KEY, () => allBannedUsers());
}

export function userIsBanned(userId: number) {
	const banStatus = cachedBannedUsers().get(userId);

	if (!banStatus?.banned) return false;
	if (banStatus.banned === 1) return true;

	const banExpiresAt = databaseTimestampToDate(banStatus.banned);

	return banExpiresAt > new Date();
}

export function refreshBannedCache() {
	cache.delete(BANNED_USERS_CACHE_KEY);

	cachedBannedUsers();
}
