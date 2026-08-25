import * as R from "remeda";
import * as AssociationRepository from "~/features/associations/AssociationRepository.server";
import { requireUser } from "~/features/auth/core/user.server";
import * as RosterSchedule from "~/features/availability/core/RosterSchedule.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { getViewerTimezone } from "~/features/timezone/timezone-context.server";
import type { SerializeFrom } from "~/utils/remix";
import * as TeamRepository from "../../team/TeamRepository.server";
import * as ScrimPickupRosterRepository from "../ScrimPickupRosterRepository.server";

export type ScrimsNewLoaderData = SerializeFrom<typeof loader>;

export const loader = async () => {
	const user = requireUser();

	const [teams, friendsAndTeammates] = await Promise.all([
		TeamRepository.findAllByMemberUserId(user.id),
		SQGroupRepository.findFriendsAndTeammates(user.id),
	]);

	// everyone the post could be made with whose schedule the author may see:
	// their teams' rosters and their friends, the same visibility rule the rest
	// of the schedule surfaces follow
	const scheduleUserIds = R.unique([
		user.id,
		...teams.flatMap((team) => team.members.map((member) => member.id)),
		...friendsAndTeammates.friends.map((friend) => friend.id),
	]);

	return {
		teams,
		associations: await AssociationRepository.findByMemberUserId(user.id),
		recentPickupRosters: await ScrimPickupRosterRepository.findAllOwnRecent(),
		schedule: await RosterSchedule.rosterScheduleData({
			userIds: scheduleUserIds,
			timezone: getViewerTimezone() ?? "UTC",
		}),
		scheduleUsers: R.uniqueBy(
			friendsAndTeammates.friends.map((friend) => ({
				id: friend.id,
				username: friend.username,
			})),
			(friend) => friend.id,
		),
	};
};
