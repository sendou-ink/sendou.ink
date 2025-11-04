import * as AdminRepository from "~/features/admin/AdminRepository.server";
import { databaseTimestampToDate } from "~/utils/dates";

let bannedUsers = await AdminRepository.allBannedUsers();

export function userIsBanned(userId: number) {
	const banStatus = bannedUsers.get(userId);

	if (!banStatus?.banned) return false;
	if (banStatus.banned === 1) return true;

	const banExpiresAt = databaseTimestampToDate(banStatus.banned);

	return banExpiresAt > new Date();
}

export async function refreshBannedCache() {
	bannedUsers = await AdminRepository.allBannedUsers();
}
