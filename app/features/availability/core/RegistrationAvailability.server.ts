import { addWeeks, subWeeks } from "date-fns";
import type { Tables } from "~/db/tables";
import { databaseTimestampToDate } from "~/utils/dates";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { AVAILABILITY } from "../availability-constants";
import type { TimeRange } from "../availability-types";
import * as Availability from "./Availability";
import * as Commitments from "./Commitments.server";
import { estimatedEndsAt } from "./TournamentDuration.server";

export type RegistrationAvailability = Awaited<
	ReturnType<typeof registrationAvailability>
>;

/**
 * Availability of the users for the tournament's estimated window (start to
 * {@link estimatedEndsAt}); its own registrations don't count as busy. Past the reportable
 * horizon every schedule would be unknown, so the result is only when the event's week opens up.
 */
export async function registrationAvailability({
	tournament,
	userIds,
	timezone,
}: {
	tournament: {
		id: number;
		name: string;
		organizationId: number | null;
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
		endsAt: await estimatedEndsAt(tournament),
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
							Availability.dateAcrossTimezones({
								date: note.date,
								from: week.timezone,
								to: timezone,
							}),
						),
					)
					.map((note) => note.text),
			),
		};
	});

	return { beyondHorizon: null, window, entries };
}
