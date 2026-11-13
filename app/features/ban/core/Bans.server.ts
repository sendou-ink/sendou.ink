/**
 * Who is banned from the site, held in memory so every request can check its user without a query. Whatever
 * writes `User.banned` (banning, unbanning, account migration) calls `refresh` after.
 */
import * as AdminRepository from "~/features/admin/AdminRepository.server";
import * as BanStatus from "./BanStatus";

let bannedUsers = await AdminRepository.findAllBannedUsers();

/** Whether the user is banned right now, as of the last `refresh`. */
export function isBanned(userId: number) {
	return BanStatus.isActive(bannedUsers.get(userId)?.banned);
}

/** Reloads the banned users from the database. */
export async function refresh() {
	bannedUsers = await AdminRepository.findAllBannedUsers();
}
