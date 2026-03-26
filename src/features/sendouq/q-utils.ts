import { modesShort } from "~/modules/in-game-lists/modes";
import { databaseTimestampToDate } from "~/utils/dates";
import { accountCreatedInTheLastSixMonths } from "~/utils/users";
import type { SQGroup } from "./core/SendouQ.server";

export function userCanJoinQueueAt(
	user: { id: number; discordId: string },
	friendCode: { createdAt: number; submitterUserId: number },
) {
	if (!accountCreatedInTheLastSixMonths(user.discordId)) return "NOW";

	// set by admin
	if (friendCode.submitterUserId !== user.id) return "NOW";

	const friendCodeCreatedAt = databaseTimestampToDate(friendCode.createdAt);

	const twentyFourHoursAgo = new Date();
	twentyFourHoursAgo.setDate(twentyFourHoursAgo.getDate() - 1);

	if (friendCodeCreatedAt < twentyFourHoursAgo) {
		return "NOW";
	}

	const canJoinQueueAt = new Date(friendCodeCreatedAt);
	canJoinQueueAt.setDate(canJoinQueueAt.getDate() + 1);

	return canJoinQueueAt;
}

export function resolveFutureMatchModes(
	groupA: Pick<SQGroup, "modePreferences">,
	groupB: Pick<SQGroup, "modePreferences">,
) {
	const ourModes = groupA.modePreferences;
	const theirModes = groupB.modePreferences;

	const overlap = ourModes.filter((mode) => theirModes.includes(mode));
	if (overlap.length > 0) {
		return overlap;
	}

	const union = modesShort.filter(
		(mode) => ourModes.includes(mode) || theirModes.includes(mode),
	);

	return union;
}
