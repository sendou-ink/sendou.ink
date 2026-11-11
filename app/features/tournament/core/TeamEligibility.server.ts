import { userIsBanned } from "~/features/ban/core/banned.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { errorToast } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { isBannedByOrganization } from "../tournament-utils.server";

export type IneligibleReason =
	| "USER_NOT_FOUND"
	| "SITE_BANNED"
	| "ORG_BANNED"
	| "NO_FRIEND_CODE"
	| "NO_IN_GAME_NAME";

/**
 * Why the user can't be put on a team of the tournament, `null` if they can.
 * Every check runs unless listed in `skip`, e.g. organizers can add players their organization has banned.
 */
export async function ineligibleReason({
	tournament,
	userId,
	skip = [],
}: {
	tournament: Tournament;
	userId: number;
	skip?: IneligibleReason[];
}): Promise<IneligibleReason | null> {
	const runs = (reason: IneligibleReason) => !skip.includes(reason);

	const user = await UserRepository.findLeanById(userId);
	if (!user) return "USER_NOT_FOUND";

	if (runs("SITE_BANNED") && userIsBanned(userId)) return "SITE_BANNED";
	if (
		runs("ORG_BANNED") &&
		(await isBannedByOrganization({ tournament, userId }))
	) {
		return "ORG_BANNED";
	}
	if (runs("NO_FRIEND_CODE") && !user.friendCode) return "NO_FRIEND_CODE";
	if (
		runs("NO_IN_GAME_NAME") &&
		tournament.ctx.settings.requireInGameNames &&
		!user.inGameName
	) {
		return "NO_IN_GAME_NAME";
	}

	return null;
}

/**
 * Throws an error toast when the user can't be put on a team of the tournament, see {@link ineligibleReason}.
 * `username` names the user in the message, leave it out when users add themselves.
 */
export async function requireEligible({
	username,
	...args
}: Parameters<typeof ineligibleReason>[0] & { username?: string }) {
	const reason = await ineligibleReason(args);
	if (reason) errorToast(message(reason, username));
}

function message(reason: IneligibleReason, username?: string) {
	const subject = username ?? "You";
	const has = username ? "has" : "have";
	const is = username ? "is" : "are";

	switch (reason) {
		case "USER_NOT_FOUND":
			return "User not found";
		case "SITE_BANNED":
			return `${subject} currently ${has} an active ban from sendou.ink`;
		case "ORG_BANNED":
			return `${subject} ${is} banned from events hosted by this organization`;
		case "NO_FRIEND_CODE":
			return `${subject} ${has} no friend code set`;
		case "NO_IN_GAME_NAME":
			return `${subject} ${has} no in-game name set`;
		default:
			assertUnreachable(reason);
	}
}
