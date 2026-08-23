import { addWeeks, subWeeks } from "date-fns";
import type { Tables } from "~/db/tables";
import { databaseTimestampToDate } from "~/utils/dates";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { AVAILABILITY } from "../availability-constants";
import type { TimeRange } from "../availability-types";
import * as Availability from "./Availability";
import * as Commitments from "./Commitments.server";
import * as TournamentDuration from "./TournamentDuration";

export type RegistrationAvailability = Awaited<
	ReturnType<typeof registrationAvailability>
>;

/**
 * Availability of the given users for a tournament's estimated window
 * (start + {@link TournamentDuration.estimateSeconds}), for the registration
 * page's availability panel. The tournament's own registrations do not count
 * as being busy — the panel asks whether people can play this very event.
 *
 * When the event starts past the reportable horizon there is nothing to
 * compute: every schedule would be unknown, so the result is only when
 * schedules for the event's week open up (the Monday its week becomes the
 * "next week").
 */
export async function registrationAvailability({
	tournament,
	userIds,
	timezone,
}: {
	tournament: {
		id: number;
		startsAt: number;
		minMembersPerTeam: number;
		bracketTypes: Array<Tables["TournamentStage"]["type"]>;
		teamCount: number;
	};
	userIds: Array<number>;
	timezone: string;
}) {
	const startDate = databaseTimestampToDate(tournament.startsAt);

	const horizon = Availability.weekRange(
		addWeeks(new Date(), AVAILABILITY.WEEK_HORIZON - 1),
		timezone,
	);
	if (tournament.startsAt >= horizon.endsAt) {
		return {
			beyondHorizon: {
				opensAt: Availability.weekStartsAt(subWeeks(startDate, 1), timezone),
			},
			window: null,
			entries: null,
		};
	}

	const window: TimeRange = {
		startsAt: tournament.startsAt,
		endsAt:
			tournament.startsAt +
			TournamentDuration.estimateSeconds({
				minMembersPerTeam: tournament.minMembersPerTeam,
				bracketTypes: tournament.bracketTypes,
				teamCount: tournament.teamCount,
			}),
	};

	const [weeks, busyByUserId] = await Promise.all([
		AvailabilityRepository.findAllWeeksByUserIds({ userIds, ...window }),
		Commitments.busyBlocksByUserIds({
			userIds,
			...window,
			excludeTournamentId: tournament.id,
		}),
	]);

	const windowDates = [
		Availability.dateInTimezone(window.startsAt, timezone),
		Availability.dateInTimezone(window.endsAt - 1, timezone),
	];

	const entries = userIds.map((userId) => {
		const userWeeks = weeks.filter((week) => week.userId === userId);

		return {
			userId,
			availability: Availability.availabilityInWindow({
				reported: userWeeks.some(
					(week) =>
						Availability.weekStartsAt(startDate, week.timezone) ===
						week.weekStartsAt,
				),
				slots: userWeeks.flatMap((week) => week.slots),
				busy: busyByUserId.get(userId) ?? [],
				window,
			}),
			notes: userWeeks.flatMap((week) =>
				week.dayNotes
					.filter((note) =>
						windowDates.includes(
							Availability.dateInTimezone(
								Availability.localToTimestamp({
									date: note.date,
									time: "12:00",
									timezone: week.timezone,
								}),
								timezone,
							),
						),
					)
					.map((note) => note.text),
			),
		};
	});

	return { beyondHorizon: null, window, entries };
}
