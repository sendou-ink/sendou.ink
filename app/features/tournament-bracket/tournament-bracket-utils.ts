import type { TournamentBadgeReceivers } from "~/features/tournament-bracket/tournament-bracket-schemas.server";
import type { TournamentLoaderData } from "../tournament/loaders/to.$id.server";
import type { Standing } from "./core/Bracket";

export const tournamentWebsocketRoom = (tournamentId: number) =>
	`tournament__${tournamentId}`;

export function fillWithNullTillPowerOfTwo<T>(arr: T[]) {
	const nextPowerOfTwo = 2 ** Math.ceil(Math.log2(arr.length));
	const nullsToAdd = nextPowerOfTwo - arr.length;

	return [...arr, ...new Array(nullsToAdd).fill(null)];
}

/**
 * Converts a group number to its corresponding letter representation.
 *
 * The function takes a one-based group number and converts it to a string
 * of uppercase letters, similar to how Excel columns are labeled (e.g., 1 -> 'A', 26 -> 'Z', 27 -> 'AA').
 *
 * @param groupNumber - The one-based group number to convert.
 * @returns The letter representation of the group number.
 */
export function groupNumberToLetters(groupNumber: number) {
	let letters = "";
	let num = groupNumber - 1; // Adjust for one-based input
	while (num >= 0) {
		letters = String.fromCharCode((num % 26) + 65) + letters;
		num = Math.floor(num / 26) - 1;
	}
	return letters;
}

export function tournamentTeamToActiveRosterUserIds(
	team: TournamentLoaderData["tournament"]["ctx"]["teams"][number],
	teamMinMemberCount: number,
) {
	if (
		team.activeRosterUserIds &&
		team.activeRosterUserIds.length === teamMinMemberCount
	) {
		return team.activeRosterUserIds;
	}

	// they don't need to select active roster as they have no subs
	if (team.members.length === teamMinMemberCount) {
		return team.members.map((member) => member.userId);
	}

	return null;
}

// deal with user getting added to multiple teams by the TO
export function ensureOneStandingPerUser(standings: Standing[]) {
	const userIds = new Set<number>();

	return standings.map((standing) => {
		return {
			...standing,
			team: {
				...standing.team,
				members: standing.team.members.filter((member) => {
					if (userIds.has(member.userId)) return false;
					userIds.add(member.userId);
					return true;
				}),
			},
		};
	});
}

/**
 * Validates the assignment of badges to receivers in a tournament finalization context.
 *
 * Checks the following conditions:
 * - Each badge receiver references a valid badge from the provided list.
 * - Every badge has at least one assigned receiver (both team and at least one user).
 * - No duplicate tournament team IDs exist among the badge receivers.
 *
 *   Returns `null` if all validations pass.
 */
export function validateBadgeReceivers({
	badgeReceivers,
	badges,
}: {
	badgeReceivers: TournamentBadgeReceivers;
	badges: ReadonlyArray<{ id: number }>;
}) {
	if (
		badgeReceivers.some(
			(receiver) => !badges.some((badge) => badge.id === receiver.badgeId),
		)
	) {
		return "BADGE_NOT_FOUND";
	}

	for (const badge of badges) {
		const owner = badgeReceivers.find(
			(receiver) => receiver.badgeId === badge.id,
		);
		if (!owner || owner.userIds.length === 0) {
			return "BADGE_NOT_ASSIGNED";
		}
	}

	const tournamentTeamIds = badgeReceivers.map(
		(receiver) => receiver.tournamentTeamId,
	);
	const uniqueTournamentTeamIds = new Set(tournamentTeamIds);
	if (tournamentTeamIds.length !== uniqueTournamentTeamIds.size) {
		return "DUPLICATE_TOURNAMENT_TEAM_ID";
	}

	return null;
}
