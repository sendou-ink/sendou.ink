import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { asyncCached, cache } from "~/utils/cache.server";
import { databaseTimestampToDate } from "~/utils/dates";

const BANNED_USERS_CACHE_KEY = "bannedUsers";

export async function cachedBannedUsers() {
	return await asyncCached(
		BANNED_USERS_CACHE_KEY,
		async () => await allBannedUsers(),
	);
}

type BannedUserRow = Pick<Tables["User"], "banned" | "bannedReason"> & {
	id: number;
};

async function allBannedUsers() {
	const rows = await db
		.selectFrom("User")
		.select(["id", "banned", "bannedReason"])
		.where("banned", "!=", 0)
		.execute();

	const result: Map<number, BannedUserRow> = new Map();

	for (const row of rows) {
		result.set(row.id, row);
	}

	return result;
}

export async function userIsBanned(userId: number) {
	const banStatus = (await cachedBannedUsers()).get(userId);

	if (!banStatus?.banned) return false;
	if (banStatus.banned === 1) return true;

	const banExpiresAt = databaseTimestampToDate(banStatus.banned);

	return banExpiresAt > new Date();
}

export async function filterBannedIds(userIds: number[]) {
	const bannedUsers = await cachedBannedUsers();
	return userIds.filter((value) => !bannedUsers.has(value));
}

export async function filterBannedUsers<T>(
	userIds: T[],
	accessor: (value: T) => number,
) {
	const bannedUsers = await cachedBannedUsers();
	return userIds.filter((value) => !bannedUsers.has(accessor(value)));
}

export async function refreshBannedCache() {
	cache.delete(BANNED_USERS_CACHE_KEY);

	await cachedBannedUsers();
}
