import * as R from "remeda";
import * as ScrimPostRepository from "~/features/scrims/ScrimPostRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import * as LeagueScheduling from "~/features/tournament-match/core/LeagueScheduling";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import * as SeriesTeamCount from "~/features/tournament-organization/core/SeriesTeamCount.server";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { AVAILABILITY } from "../availability-constants";
import type { BusyBlock } from "../availability-types";
import * as Availability from "./Availability";
import * as TournamentDuration from "./TournamentDuration";
import { estimatedEndsAtWith } from "./TournamentDuration.server";

/**
 * Busy blocks of the users within the window, keyed by user id, sorted by start (effective
 * availability = reported − busy). From tournament registrations (start + estimated duration,
 * {@link TournamentDuration.estimateSeconds}), accepted scrims (start + assumed length) and team
 * events (actual span). A league registration is not a block, its sets are: each one agreed to be
 * played blocks {@link LeagueScheduling.busyBlock}.
 * `excludeTournamentId` leaves one tournament out, for "busy elsewhere" views of that tournament.
 * Busy blocks are part of the schedule, so callers pass only ids
 * {@link AvailabilityRepository.findScheduleVisibleUserIds} handed back.
 */
export async function busyBlocksByUserIds({
	userIds,
	startsAt,
	endsAt,
	excludeTournamentId,
}: {
	userIds: Array<number>;
	startsAt: number;
	endsAt: number;
	excludeTournamentId?: number;
}): Promise<Map<number, Array<BusyBlock>>> {
	if (userIds.length === 0) return new Map();

	const registrations =
		await TournamentTeamRepository.findAllRegistrationsByUserIds({
			userIds,
			startsAt: startsAt - TournamentDuration.MAX_ESTIMATE_SECONDS,
			endsAt,
			excludeTournamentId,
		});
	const scrims = await ScrimPostRepository.findAllAcceptedByUserIds({
		userIds,
		startsAt: startsAt - AVAILABILITY.SCRIM_COMMITMENT_SECONDS,
		endsAt,
	});
	const teamEvents = await AvailabilityRepository.findAllTeamEventsByUserIds({
		userIds,
		startsAt,
		endsAt,
	});
	const leagueSets = await TournamentMatchRepository.findScheduledByUserIds({
		userIds,
		startsAt:
			startsAt - LeagueScheduling.LEAGUE_SCHEDULING.SET_DURATION_SECONDS,
		endsAt,
	});
	const expectedTeamCount = await SeriesTeamCount.lookup();

	const blocks: Array<BusyBlock & { userId: number }> = [
		...registrations
			.filter((registration) => !registration.settings.isLeague)
			.map((registration) => ({
				userId: registration.userId,
				type: "tournament" as const,
				name: registration.name,
				startsAt: registration.startsAt,
				endsAt: estimatedEndsAtWith(
					{
						...registration,
						minMembersPerTeam: registration.settings.minMembersPerTeam ?? 4,
						bracketTypes: registration.settings.bracketProgression.map(
							(bracket) => bracket.type,
						),
					},
					expectedTeamCount,
				),
			})),
		...scrims.map((scrim) => ({
			userId: scrim.userId,
			type: "scrim" as const,
			name: null,
			startsAt: scrim.startsAt,
			endsAt: scrim.startsAt + AVAILABILITY.SCRIM_COMMITMENT_SECONDS,
		})),
		...teamEvents.map((event) => ({
			userId: event.userId,
			type: "teamEvent" as const,
			name: event.name,
			startsAt: event.startsAt,
			endsAt: event.endsAt,
		})),
		...leagueSets
			.filter((set) => set.tournamentId !== excludeTournamentId)
			.map((set) => ({
				userId: set.userId,
				type: "tournament" as const,
				name: set.name,
				...LeagueScheduling.busyBlock(set.scheduledAt),
			})),
	].filter((block) => Availability.overlaps(block, { startsAt, endsAt }));

	return new Map(
		Object.entries(R.groupBy(blocks, (block) => block.userId)).map(
			([userId, userBlocks]) => [
				Number(userId),
				R.sortBy(
					userBlocks.map((block) => R.omit(block, ["userId"])),
					(block) => block.startsAt,
				),
			],
		),
	);
}
