import * as AdminRepository from "~/features/admin/AdminRepository.server";
import { databaseTimestampToDate } from "~/utils/dates";

let bannedUsers = await AdminRepository.allBannedUsers();

export function checkBanStatus(
	banned: number | null | undefined,
	now: Date = new Date(),
): boolean {
	if (!banned) return false;
	if (banned === 1) return true;

	const banExpiresAt = databaseTimestampToDate(banned);

	return banExpiresAt > now;
}

export function userIsBanned(userId: number) {
	const banStatus = bannedUsers.get(userId);

	return checkBanStatus(banStatus?.banned);
}

export async function refreshBannedCache() {
	bannedUsers = await AdminRepository.allBannedUsers();
}
