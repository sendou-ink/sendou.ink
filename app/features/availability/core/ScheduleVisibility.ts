/**
 * Who sees a user's schedule. Unset, it is shared with everyone; once limited it is an allow-list
 * of the user's friends (all or none) and teams, a team joined later starting outside it.
 */
import type { UserPreferences } from "~/db/tables-json";
import { SCHEDULE_VISIBILITY_FRIENDS_VALUE } from "../availability-constants";
import type { ScheduleAudienceTeam } from "../availability-types";

type ScheduleVisibilityPreference = UserPreferences["scheduleVisibility"];

/**
 * Whether a schedule with this visibility is shared with a viewer who is or is not a friend of its
 * owner and shares these teams with them. Without the preference it is shared with everyone.
 */
export function sharesWith({
	visibility,
	isFriend,
	sharedTeamIds,
}: {
	visibility: ScheduleVisibilityPreference;
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
export function hiddenFrom({
	visibility,
	teams,
}: {
	visibility: ScheduleVisibilityPreference;
	teams: Array<ScheduleAudienceTeam>;
}): { friends: boolean; teams: Array<ScheduleAudienceTeam> } {
	if (!visibility) return { friends: false, teams: [] };

	return {
		friends: !visibility.friends,
		teams: teams.filter((team) => !visibility.teamIds.includes(team.id)),
	};
}

/**
 * The preference to save from the visibility picker's checked options (team ids and
 * {@link SCHEDULE_VISIBILITY_FRIENDS_VALUE}), teams the user is no longer a member of dropped.
 * Friends and every team checked saves no preference, so that teams joined later are shared with
 * too; a user with no teams checking friends shares with friends only.
 */
export function fromSelection({
	sharedWith,
	teams,
}: {
	sharedWith: Array<string>;
	teams: Array<Pick<ScheduleAudienceTeam, "id">>;
}): ScheduleVisibilityPreference {
	const selected = new Set(sharedWith);

	const friends = selected.has(SCHEDULE_VISIBILITY_FRIENDS_VALUE);
	const teamIds = teams
		.filter((team) => selected.has(String(team.id)))
		.map((team) => team.id);

	if (friends && teams.length > 0 && teamIds.length === teams.length) {
		return undefined;
	}

	return { friends, teamIds };
}
