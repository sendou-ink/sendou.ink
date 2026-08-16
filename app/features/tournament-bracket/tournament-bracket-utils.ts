import type { Tables } from "~/db/tables";
import type {
	TournamentBadgeReceivers,
	TournamentTrophyReceiver,
} from "~/features/tournament-bracket/tournament-bracket-schemas";
import type { TournamentLoaderData } from "../tournament/loaders/to.$id.server";
import type { Standing } from "./core/Bracket";

export const tournamentWebsocketRoom = (tournamentId: number) =>
	`tournament__${tournamentId}`;

/**
 * Room of the slice of the brackets page one bracket's (for the types viewed one group at
 * a time, one group's) match data is rendered in. Broadcasts that can only have changed
 * that match data go here rather than to the whole tournament's room, so that the viewers
 * of the other brackets and groups do not refetch.
 */
export const tournamentBracketWebsocketRoom = ({
	tournamentId,
	bracketIdx,
	groupId,
}: {
	tournamentId: number;
	bracketIdx: number;
	/** Only set for the bracket types {@link showsOneGroupAtATime}. */
	groupId: number | null;
}) =>
	`${tournamentWebsocketRoom(tournamentId)}__bracket__${bracketIdx}${
		groupId !== null ? `__group__${groupId}` : ""
	}`;

/** Whether the brackets page shows one group of this bracket type at a time, rather than all of them. */
export const showsOneGroupAtATime = (type: Tables["TournamentStage"]["type"]) =>
	type === "swiss";

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
	if (team.memberUserIds.length === teamMinMemberCount) {
		return team.memberUserIds;
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
				memberUserIds: standing.team.memberUserIds.filter((userId) => {
					if (userIds.has(userId)) return false;
					userIds.add(userId);
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

export function validateTrophyReceiver({
	trophyReceiver,
	trophy,
}: {
	trophyReceiver: TournamentTrophyReceiver | null;
	trophy: { id: number } | null;
}) {
	if (!trophy) return null;

	if (!trophyReceiver || trophyReceiver.trophyId !== trophy.id) {
		return "TROPHY_NOT_FOUND";
	}

	if (trophyReceiver.userIds.length === 0) {
		return "TROPHY_NOT_ASSIGNED";
	}

	return null;
}
