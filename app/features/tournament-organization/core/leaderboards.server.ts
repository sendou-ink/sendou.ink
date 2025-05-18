import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import type { CommonUser } from "~/utils/kysely.server";
import type { Unpacked } from "~/utils/types";
import type * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";

const THIRD_PLACE_POINTS = 1;
const SECOND_PLACE_POINTS = THIRD_PLACE_POINTS * 2;
const FIRST_PLACE_POINTS = SECOND_PLACE_POINTS * 2;

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

export async function eventLeaderboards(
	events: Awaited<
		ReturnType<typeof TournamentOrganizationRepository.findAllEventsBySeries>
	>,
) {
	const points = new Map<number, LeaderboardInfo>();

	for (const event of events) {
		const eventsPoints = event.tournamentId
			? await tournamentPoints(event as typeof event & { tournamentId: number })
			: await calendarEventPoints(event);

		mergeMaps(points, eventsPoints);
	}

	return Array.from(points.values())
		.sort((a, b) => b.points - a.points)
		.map((info) => ({ ...info, points: info.points.toFixed(2) }));
}

async function tournamentPoints(
	event: EventLeaderboardEvent & { tournamentId: number },
): Promise<Map<number, LeaderboardInfo>> {
	const results = await TournamentRepository.topThreeResultsByTournamentId(
		event.tournamentId,
	);

	const leaderboardInfo = new Map<number, LeaderboardInfo>();

	if (results.length === 0) return leaderboardInfo;

	for (const result of results) {
		const teamSize = results.filter(
			(result2) => result.tournamentTeamId === result2.tournamentTeamId,
		).length;

		leaderboardInfo.set(result.user.id, {
			user: result.user,
			points: pointsAdjustedToTeamSize({
				basePoints:
					result.placement === 1
						? FIRST_PLACE_POINTS
						: result.placement === 2
							? SECOND_PLACE_POINTS
							: THIRD_PLACE_POINTS,
				teamSize: teamSize,
			}),
			placements: {
				first: result.placement === 1 ? 1 : 0,
				second: result.placement === 2 ? 1 : 0,
				third: result.placement === 3 ? 1 : 0,
			},
		});
	}

	return leaderboardInfo;
}

async function calendarEventPoints(
	event: EventLeaderboardEvent,
): Promise<Map<number, LeaderboardInfo>> {
	const results = await CalendarRepository.findResultsByEventId(event.eventId);

	const leaderboardInfo = new Map<number, LeaderboardInfo>();

	if (results.length === 0) return leaderboardInfo;

	for (const placement of [1, 2, 3]) {
		const placementResults = results.filter(
			(result) => result.placement === placement,
		);

		for (const team of placementResults) {
			const teamSize = team.players.filter((player) => player.id).length;

			for (const player of team.players) {
				// not a connected user, reported as simple text
				if (!player.id) continue;

				leaderboardInfo.set(player.id, {
					user: {
						customUrl: player.customUrl,
						discordAvatar: player.discordAvatar,
						discordId: player.discordId!,
						id: player.id,
						username: player.username!,
					},
					points: pointsAdjustedToTeamSize({
						basePoints:
							placement === 1
								? FIRST_PLACE_POINTS
								: placement === 2
									? SECOND_PLACE_POINTS
									: THIRD_PLACE_POINTS,
						teamSize: teamSize,
					}),
					placements: {
						first: placement === 1 ? 1 : 0,
						second: placement === 2 ? 1 : 0,
						third: placement === 3 ? 1 : 0,
					},
				});
			}
		}
	}

	return leaderboardInfo;
}

function pointsAdjustedToTeamSize({
	basePoints,
	teamSize,
}: { basePoints: number; teamSize: number }) {
	if (teamSize <= 4) return basePoints;

	return (basePoints * 4) / teamSize;
}

function mergeMaps(
	accMap: Map<number, LeaderboardInfo>,
	newMap: Map<number, LeaderboardInfo>,
) {
	for (const [userId, info] of newMap) {
		const accPoints = accMap.get(userId);

		if (!accPoints) {
			accMap.set(userId, info);
			continue;
		}

		accPoints.points += info.points;
		accPoints.placements.first += info.placements.first;
		accPoints.placements.second += info.placements.second;
		accPoints.placements.third += info.placements.third;
	}
}
