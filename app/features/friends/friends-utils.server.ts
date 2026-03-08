import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";

export function resolveFriendActivity(
	friendId: number,
	tournamentName: string | null,
) {
	const ownGroup = SendouQ.findOwnGroup(friendId);

	if (ownGroup && ownGroup.members.length < FULL_GROUP_SIZE) {
		return {
			subtitle: "SendouQ",
			badge: `${ownGroup.members.length}/${FULL_GROUP_SIZE}`,
		};
	}

	if (tournamentName) {
		return {
			subtitle: tournamentName,
			badge: `1/${FULL_GROUP_SIZE}`,
		};
	}

	return { subtitle: null, badge: null };
}
