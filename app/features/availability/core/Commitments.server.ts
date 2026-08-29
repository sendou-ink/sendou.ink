import * as R from "remeda";
import * as ScrimPostRepository from "~/features/scrims/ScrimPostRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import * as SeriesTeamCount from "~/features/tournament-organization/core/SeriesTeamCount.server";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { AVAILABILITY } from "../availability-constants";
import type { BusyBlock } from "../availability-types";
import * as Availability from "./Availability";
import * as TournamentDuration from "./TournamentDuration";

/**
 * The busy blocks of the given users within the given window, keyed by user
 * id and sorted by start. A busy block overrides whatever availability the
 * user reported: effective availability = reported − busy blocks.
 *
 * Sourced from tournament registrations (start + estimated duration, see
 * {@link TournamentDuration.estimateSeconds}), accepted scrims (start + an
 * assumed length) and team events (their actual span). League registrations
 * are not blocks — a league runs over weeks and its matches are scheduled
 * separately. `excludeTournamentId` leaves that tournament's registrations
 * out, for surfaces asking "busy elsewhere" while looking at that tournament.
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

	// xxx: when promise.all not the play
	const [registrations, scrims, teamEvents, expectedTeamCount] =
		await Promise.all([
			TournamentTeamRepository.findAllRegistrationsByUserIds({
				userIds,
				startsAt: startsAt - TournamentDuration.MAX_ESTIMATE_SECONDS,
				endsAt,
				excludeTournamentId,
			}),
			ScrimPostRepository.findAllAcceptedByUserIds({
				userIds,
				startsAt: startsAt - AVAILABILITY.SCRIM_COMMITMENT_SECONDS,
				endsAt,
			}),
			AvailabilityRepository.findAllTeamEventsByUserIds({
				userIds,
				startsAt,
				endsAt,
			}),
			SeriesTeamCount.lookup(),
		]);

	const blocks: Array<BusyBlock & { userId: number }> = [
		...registrations
			.filter((registration) => !registration.settings.isLeague)
			.map((registration) => ({
				userId: registration.userId,
				type: "tournament" as const,
				name: registration.name,
				startsAt: registration.startsAt,
				endsAt:
					registration.startsAt +
					TournamentDuration.estimateSeconds({
						minMembersPerTeam: registration.settings.minMembersPerTeam ?? 4,
						bracketTypes: registration.settings.bracketProgression.map(
							(bracket) => bracket.type,
						),
						teamCount: expectedTeamCount(registration),
					}),
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
