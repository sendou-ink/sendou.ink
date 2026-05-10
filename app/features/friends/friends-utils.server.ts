import { groupExpiryStatus } from "~/features/sendouq/core/groups";
import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import { SENDOUQ_ACTIVITY_LABEL } from "./friends-constants";

export function resolveFriendActivity(
	friendId: number,
	tournamentName: string | null,
	teamMemberCount: number | null,
	tournamentMinTeamSize: number | null,
) {
	const ownGroup = SendouQ.findOwnGroup(friendId);

	if (
		ownGroup &&
		ownGroup.members.length < FULL_GROUP_SIZE &&
		groupExpiryStatus(ownGroup.latestActionAt) !== "EXPIRED"
	) {
		return {
			subtitle: SENDOUQ_ACTIVITY_LABEL,
			badge: `${ownGroup.members.length}/${FULL_GROUP_SIZE}`,
		};
	}

	if (tournamentName) {
		return {
			subtitle: tournamentName,
			badge: `${teamMemberCount ?? 1}/${tournamentMinTeamSize ?? FULL_GROUP_SIZE}`,
		};
	}

	return { subtitle: null, badge: null };
}
