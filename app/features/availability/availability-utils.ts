import type { UserPreferences } from "~/db/tables-json";
import type { ScheduleAudienceTeam } from "./availability-types";

/**
 * Whether a schedule with this visibility is shared with a viewer who is or is not a friend of its
 * owner and shares these teams with them. Without the preference it is shared with everyone.
 */
export function sharesScheduleWith({
	visibility,
	isFriend,
	sharedTeamIds,
}: {
	visibility: UserPreferences["scheduleVisibility"];
	isFriend: boolean;
	sharedTeamIds: Array<number>;
}) {
	if (!visibility) return true;

	return (
		(visibility.friends && isFriend) ||
		sharedTeamIds.some((teamId) => visibility.teamIds.includes(teamId))
	);
}

/**
 * Friends and teams the user keeps their schedule from, nothing while it is shared with everyone.
 * A team joined after the visibility was last saved is outside the allow-list, so it shows up here.
 */
export function scheduleAudiencesHiddenFrom({
	visibility,
	teams,
}: {
	visibility: UserPreferences["scheduleVisibility"];
	teams: Array<ScheduleAudienceTeam>;
}): { friends: boolean; teams: Array<ScheduleAudienceTeam> } {
	if (!visibility) return { friends: false, teams: [] };

	return {
		friends: !visibility.friends,
		teams: teams.filter((team) => !visibility.teamIds.includes(team.id)),
	};
}
