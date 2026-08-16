import * as UserRepository from "#lib/features/user-page/UserRepository.server.ts";
import { databaseTimestampToDate } from "#lib/utils/dates.ts";

let bannedUsers: Awaited<
	ReturnType<typeof UserRepository.findAllBannedUsers>
> | null = null;

export function checkBanStatus(
	banned: number | null | undefined,
	now: Date = new Date(),
): boolean {
	if (!banned) return false;
	if (banned === 1) return true;

	const banExpiresAt = databaseTimestampToDate(banned);

	return banExpiresAt > now;
}

export async function userIsBanned(userId: number) {
	if (!bannedUsers) {
		bannedUsers = await UserRepository.findAllBannedUsers();
	}

	const banStatus = bannedUsers.get(userId);

	return checkBanStatus(banStatus?.banned);
}

export async function refreshBannedCache() {
	bannedUsers = await UserRepository.findAllBannedUsers();
}
