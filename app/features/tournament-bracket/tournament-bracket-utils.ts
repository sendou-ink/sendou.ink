import type { Tables } from "~/db/tables";
import type { TournamentStageSettings } from "~/db/tables-json";
import { CHANNEL_PREFIX } from "~/features/events/events-types";
import type {
	TournamentBadgeReceivers,
	TournamentTrophyReceiver,
} from "~/features/tournament-bracket/tournament-bracket-schemas";
import type { TournamentLoaderData } from "../tournament/loaders/to.$id.server";
import type { Standing } from "./core/Bracket";

export const tournamentChannel = (tournamentId: number) =>
	`${CHANNEL_PREFIX.tournament}${tournamentId}`;

/**
 * Channel of one bracket's (or, for types viewed one group at a time, one group's) match data.
 * Broadcasts only affecting that data go here instead of the tournament's channel so other viewers don't refetch.
 */
export const tournamentBracketChannel = ({
	tournamentId,
	bracketIdx,
	groupId,
}: {
	tournamentId: number;
	bracketIdx: number;
	/** Only set for the bracket types {@link showsOneGroupAtATime}. */
	groupId: number | null;
}) =>
	`${tournamentChannel(tournamentId)}__bracket__${bracketIdx}${
		groupId !== null ? `__group__${groupId}` : ""
	}`;

/** Whether the brackets page shows one group of the bracket at a time, rather than all of them: swiss and elimination split into groups. */
export const showsOneGroupAtATime = (bracket: {
	type: Tables["TournamentStage"]["type"];
	settings: TournamentStageSettings | null;
}) =>
	bracket.type === "swiss" ||
	(isEliminationType(bracket.type) && (bracket.settings?.groupCount ?? 1) > 1);

/** Single or double elimination. */
const isEliminationType = (
	type: Tables["TournamentStage"]["type"],
): type is "single_elimination" | "double_elimination" =>
	type === "single_elimination" || type === "double_elimination";

/** One-based group number to Excel column style letters: 1 -> 'A', 26 -> 'Z', 27 -> 'AA'. */
export function groupNumberToLetters(groupNumber: number) {
	let letters = "";
	let num = groupNumber - 1;
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

/** Deals with a user getting added to multiple teams by the TO */
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
 * Every receiver references a given badge, every badge has a team and at least one user, no team
 * receives twice. Returns `null` when valid.
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

/**
 * The trophy goes only to members of the 1st place teams (several when co-winners) and every one
 * of those teams has at least one receiver. Returns `null` when valid.
 */
export function validateTrophyReceiver({
	trophyReceiver,
	trophy,
	firstPlaceTeams,
}: {
	trophyReceiver: TournamentTrophyReceiver | null;
	trophy: { id: number } | null;
	firstPlaceTeams: ReadonlyArray<{ memberUserIds: ReadonlyArray<number> }>;
}) {
	if (!trophy) return null;

	if (!trophyReceiver || trophyReceiver.trophyId !== trophy.id) {
		return "TROPHY_NOT_FOUND";
	}

	if (trophyReceiver.userIds.length === 0) {
		return "TROPHY_NOT_ASSIGNED";
	}

	const isFirstPlaceMember = (userId: number) =>
		firstPlaceTeams.some((team) => team.memberUserIds.includes(userId));
	if (!trophyReceiver.userIds.every(isFirstPlaceMember)) {
		return "TROPHY_RECEIVER_NOT_FIRST_PLACE";
	}

	const teamHasReceiver = (team: { memberUserIds: ReadonlyArray<number> }) =>
		team.memberUserIds.length === 0 ||
		team.memberUserIds.some((userId) =>
			trophyReceiver.userIds.includes(userId),
		);
	if (!firstPlaceTeams.every(teamHasReceiver)) {
		return "TROPHY_TEAM_NOT_ASSIGNED";
	}

	return null;
}
