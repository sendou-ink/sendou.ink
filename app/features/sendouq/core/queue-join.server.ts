import * as UserActivity from "~/features/user-activity/core/UserActivity.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { userCanJoinQueueAt } from "../q-utils";

/** Why the user can't join SendouQ right now, `null` if they can. */
export async function queueJoinBlocker(user: {
	id: number;
	discordId: string;
}) {
	if (UserActivity.resolve(user.id).lobby) return "IN_LOBBY" as const;

	const friendCode = await UserRepository.findCurrentFriendCodeByUserId(
		user.id,
	);
	if (!friendCode) return "NO_FRIEND_CODE" as const;

	if (userCanJoinQueueAt(user, friendCode) !== "NOW") {
		return "FRIEND_CODE_TOO_RECENT" as const;
	}

	return null;
}
