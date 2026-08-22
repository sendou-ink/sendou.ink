import * as R from "remeda";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import type { CommonUser } from "~/utils/kysely.server";
import type { Unpacked } from "~/utils/types";
import type * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";

const THIRD_PLACE_POINTS = 1;
const SECOND_PLACE_POINTS = THIRD_PLACE_POINTS * 2;
const FIRST_PLACE_POINTS = SECOND_PLACE_POINTS * 2;

const POINTS_TIE_EPSILON = 0.0001;

const USER_KEYS = [
	"id",
	"username",
	"discordId",
	"discordAvatar",
	"customUrl",
	"customAvatarUrl",
] as const;

type EventLeaderboardEvent = Unpacked<
	Awaited<
		ReturnType<typeof TournamentOrganizationRepository.findAllEventsBySeries>
	>
>;

interface LeaderboardInfo {
	user: CommonUser;
	points: number;
	placements: {
		first: number;
		second: number;
		third: number;
	};
}

export async function eventLeaderboards(events: EventLeaderboardEvent[]) {
	const tournamentIds: number[] = [];
	const calendarEventIds: number[] = [];

	for (const event of events) {
		if (event.tournamentId) {
			tournamentIds.push(event.tournamentId);
		} else {
			calendarEventIds.push(event.eventId);
		}
	}

	const [tournamentResults, calendarEventResults] = await Promise.all([
		TournamentRepository.findTopThreeResultsByTournamentIds(tournamentIds),
		CalendarRepository.findTopThreeResultsByEventIds(calendarEventIds),
	]);

	const points = new Map<number, LeaderboardInfo>();

	addTournamentPoints(points, tournamentResults);
	addCalendarEventPoints(points, calendarEventResults);

	return Array.from(points.values())
		.sort(byPointsThenPlacements)
		.map((info) => ({ ...info, points: info.points.toFixed(2) }));
}

/** Most points first, ties broken by most first places, then seconds, then thirds. */
function byPointsThenPlacements(a: LeaderboardInfo, b: LeaderboardInfo) {
	const pointsDifference = b.points - a.points;

	// team size adjusted points are fractional, so equal totals can differ in the last bits
	if (Math.abs(pointsDifference) > POINTS_TIE_EPSILON) return pointsDifference;

	return (
		b.placements.first - a.placements.first ||
		b.placements.second - a.placements.second ||
		b.placements.third - a.placements.third
	);
}

type TournamentResult = Unpacked<
	Awaited<
		ReturnType<typeof TournamentRepository.findTopThreeResultsByTournamentIds>
	>
>;

function addTournamentPoints(
	acc: Map<number, LeaderboardInfo>,
	results: TournamentResult[],
) {
	const teamSizes = R.countBy(results, (result) => result.tournamentTeamId);

	for (const result of results) {
		addPlacement(acc, {
			user: R.pick(result, USER_KEYS),
			placement: result.placement,
			teamSize: teamSizes[result.tournamentTeamId],
		});
	}
}

type CalendarEventResult = Unpacked<
	Awaited<ReturnType<typeof CalendarRepository.findTopThreeResultsByEventIds>>
>;

function addCalendarEventPoints(
	acc: Map<number, LeaderboardInfo>,
	results: CalendarEventResult[],
) {
	// players reported as simple text don't score
	const teamSizes = R.countBy(
		results.filter((result) => result.id),
		(result) => result.teamId,
	);

	for (const result of results) {
		if (!result.id) continue;

		addPlacement(acc, {
			user: {
				...R.pick(result, USER_KEYS),
				id: result.id,
				username: result.username!,
				discordId: result.discordId!,
			},
			placement: result.placement,
			teamSize: teamSizes[result.teamId],
		});
	}
}

function addPlacement(
	acc: Map<number, LeaderboardInfo>,
	{
		user,
		placement,
		teamSize,
	}: {
		user: CommonUser;
		placement: number;
		teamSize: number;
	},
) {
	const points = pointsAdjustedToTeamSize({
		basePoints:
			placement === 1
				? FIRST_PLACE_POINTS
				: placement === 2
					? SECOND_PLACE_POINTS
					: THIRD_PLACE_POINTS,
		teamSize,
	});

	const existing = acc.get(user.id);

	if (!existing) {
		acc.set(user.id, {
			user,
			points,
			placements: {
				first: placement === 1 ? 1 : 0,
				second: placement === 2 ? 1 : 0,
				third: placement === 3 ? 1 : 0,
			},
		});
		return;
	}

	existing.points += points;
	if (placement === 1) existing.placements.first += 1;
	if (placement === 2) existing.placements.second += 1;
	if (placement === 3) existing.placements.third += 1;
}

function pointsAdjustedToTeamSize({
	basePoints,
	teamSize,
}: {
	basePoints: number;
	teamSize: number;
}) {
	if (teamSize <= 4) return basePoints;

	return (basePoints * 4) / teamSize;
}
