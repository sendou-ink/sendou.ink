/**
 * The schedule data of each page showing schedules: the events page's editor of the user's own
 * weeks, friends' weeks on the friends page, a roster's fit to a tournament on its registration
 * page, and the scrim pages' roster schedules and window fits.
 */
import { addWeeks, subWeeks } from "date-fns";
import * as R from "remeda";
import type { Tables } from "~/db/tables";
import { getViewerTimezone } from "~/features/timezone/timezone-context.server";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { AVAILABILITY } from "../availability-constants";
import type {
	DayTimeRange,
	ScheduleWeekView,
	TimeRange,
	WindowSchedule,
} from "../availability-types";
import * as Availability from "./Availability";
import * as DayTrack from "./DayTrack";
import * as Schedules from "./Schedules.server";
import * as ScheduleWeek from "./ScheduleWeek";
import * as TournamentDuration from "./TournamentDuration.server";

const DAY_SECONDS = 24 * 60 * 60;

/** The schedule editor's data as the events page loader hands it to the browser. */
export type MyScheduleData = SerializeFrom<
	Awaited<ReturnType<typeof myScheduleData>>
>;

/**
 * The user's reported current and next week in their timezone as the editor's wall-clock
 * representation, plus the week before for the "Copy last week" prefill.
 */
export async function myScheduleData(userId: number) {
	const timezone = getViewerTimezone() ?? "UTC";
	const now = new Date();

	const lastWeekRange = Availability.weekRange(subWeeks(now, 1), timezone);
	const horizonEndsAt = Availability.weekRange(
		addWeeks(now, AVAILABILITY.WEEK_HORIZON - 1),
		timezone,
	).endsAt;
	const reportedWeeks = await AvailabilityRepository.findAllWeeksByUserIds({
		userIds: [userId],
		startsAt: lastWeekRange.startsAt,
		endsAt: horizonEndsAt,
	});
	const busyBlocks = await Schedules.busyBlocksByUserIds({
		userIds: [userId],
		startsAt: Availability.weekRange(now, timezone).startsAt,
		endsAt: horizonEndsAt,
	});

	const weeks = R.range(0, AVAILABILITY.WEEK_HORIZON).map((weekOffset) =>
		editorWeek({
			range: Availability.weekRange(addWeeks(now, weekOffset), timezone),
			timezone,
			reportedWeeks,
		}),
	);

	const lastWeek = editorWeek({
		range: lastWeekRange,
		timezone,
		reportedWeeks,
	});

	return {
		weeks,
		lastWeekRanges: lastWeek.submitted
			? lastWeek.days.map((day) => day.ranges)
			: null,
		commitments: (busyBlocks.get(userId) ?? []).map((block) => ({
			date: Availability.dateInTimezone(block.startsAt, timezone),
			range: slotToDayRange(block, timezone),
			type: block.type,
			name: block.name,
		})),
	};
}

/**
 * Reportable weeks keyed by user id, free time only (commitments subtracted). Users who reported
 * neither week, and those not sharing their schedule with the viewer, are left out; the friends
 * page sorts and shows its calendar icon by the missing key.
 */
export async function friendWeeks({
	userIds,
	timezone,
	viewerId,
}: {
	userIds: Array<number>;
	timezone: string;
	viewerId: number;
}): Promise<Map<number, Array<ScheduleWeekView>>> {
	const now = new Date();

	const ranges = R.range(0, AVAILABILITY.WEEK_HORIZON).map((weekOffset) =>
		Availability.weekRange(addWeeks(now, weekOffset), timezone),
	);
	const horizon = {
		startsAt: ranges[0].startsAt,
		endsAt: ranges[ranges.length - 1].endsAt,
	};

	const { reportedWeeks, busyByUserId } = await Schedules.findVisibleByUserIds({
		userIds,
		viewerId,
		...horizon,
	});

	const weeks = ranges.map((range, index) => ({
		range,
		week: index === 0 ? ("current" as const) : ("next" as const),
		weekNumber: ScheduleWeek.weekNumber(range, timezone),
		days: ScheduleWeek.days(range, timezone),
	}));

	return new Map(
		userIds.flatMap((userId) => {
			const busy = busyByUserId.get(userId) ?? [];

			const views = weeks.map((week): ScheduleWeekView => {
				const row = ScheduleWeek.memberRow({
					userId,
					days: week.days,
					timezone,
					reportedWeeks,
					range: week.range,
					busy,
				});

				return {
					week: week.week,
					weekNumber: week.weekNumber,
					reported: row.reported,
					days: week.days.map((day, dayIndex) => ({
						noonAt: day.noonAt,
						ranges: row.days[dayIndex].ranges,
					})),
				};
			});

			return views.some((view) => view.reported) ? [[userId, views]] : [];
		}),
	);
}

/** Each roster member's fit to the tournament's window, or when that opens up (`beyondHorizon`) for an event past the reportable weeks. */
export type RegistrationAvailability = Awaited<
	ReturnType<typeof registrationAvailability>
>;

/**
 * Availability of the users for the tournament's estimated window (start to
 * {@link TournamentDuration.estimatedEndsAt}); its own registrations don't count as busy. Past the reportable
 * horizon every schedule would be unknown, so the result is only when the event's week opens up.
 */
export async function registrationAvailability({
	tournament,
	userIds,
	timezone,
	viewerId,
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
	viewerId: number;
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
		endsAt: await TournamentDuration.estimatedEndsAt(tournament),
	};

	const { reportedWeeks: weeks, busyByUserId } =
		await Schedules.findVisibleByUserIds({
			userIds,
			viewerId,
			...window,
			excludeTournamentId: tournament.id,
		});

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

/** The roster members' weeks as a loader hands them to the browser. */
export type RosterScheduleData = SerializeFrom<
	Awaited<ReturnType<typeof rosterScheduleData>>
>;

/**
 * Effective availability of the users over the reportable horizon as viewer-local weeks and
 * days. Which users form a roster is only known in the browser (scrim post form's team select,
 * pick-up search), so members come out one by one and {@link Availability.playableWindows}
 * merges the picked ones client side.
 */
export async function rosterScheduleData({
	userIds,
	timezone,
	viewerId,
}: {
	userIds: Array<number>;
	timezone: string;
	viewerId: number;
}) {
	const now = new Date();
	const horizon = {
		startsAt: Availability.weekRange(now, timezone).startsAt,
		endsAt: Availability.weekRange(
			addWeeks(now, AVAILABILITY.WEEK_HORIZON - 1),
			timezone,
		).endsAt,
	};

	const { reportedWeeks, busyByUserId } = await Schedules.findVisibleByUserIds({
		userIds,
		viewerId,
		...horizon,
	});

	const weeks = R.range(0, AVAILABILITY.WEEK_HORIZON).map((weekOffset) =>
		weekView({
			range: Availability.weekRange(addWeeks(now, weekOffset), timezone),
			timezone,
		}),
	);

	return {
		/** Server clock, so that the picker's cutoff of past windows renders the same before and after hydration. */
		now: dateToDatabaseTimestamp(now),
		weeks,
		members: userIds.map((userId) => {
			const memberWeeks = reportedWeeks.filter(
				(week) => week.userId === userId,
			);
			const busy = busyByUserId.get(userId) ?? [];

			return {
				userId,
				reportedWeekStarts: weeks
					.filter((week) =>
						memberWeeks.some((memberWeek) =>
							Availability.isSameWeek(memberWeek.weekStartsAt, week.startsAt),
						),
					)
					.map((week) => week.startsAt),
				ranges: Availability.subtract(
					Availability.clip(
						memberWeeks.flatMap((week) => week.slots),
						horizon,
					),
					busy,
				),
			};
		}),
	};
}

/**
 * What the users' schedules say about each window: reported ranges inside it, overriding
 * commitments and whether the week was filled in at all. Resolved in one go so a page with many
 * windows (scrim fit indicators) reads the schedules once. Windows past the horizon are left out.
 */
export async function windowSchedules({
	windows,
	userIds,
	viewerId,
}: {
	windows: Array<TimeRange & { id: number }>;
	userIds: Array<number>;
	/** Null when logged out, which the scrims page is viewable as. */
	viewerId: number | null;
}) {
	// the horizon's last week starts at the current week's start at the latest, so nothing inside it reaches this far
	const horizonEndsAt = dateToDatabaseTimestamp(
		addWeeks(new Date(), AVAILABILITY.WEEK_HORIZON),
	);
	const withinHorizon = windows.filter(
		(window) => window.startsAt < horizonEndsAt,
	);

	if (withinHorizon.length === 0 || userIds.length === 0 || viewerId === null) {
		return [];
	}

	const range = {
		startsAt: Math.min(...withinHorizon.map((window) => window.startsAt)),
		endsAt: Math.max(...withinHorizon.map((window) => window.endsAt)),
	};

	const { reportedWeeks, busyByUserId } = await Schedules.findVisibleByUserIds({
		userIds,
		viewerId,
		...range,
	});

	return withinHorizon.map((window) => ({
		id: window.id,
		members: userIds.map((userId): WindowSchedule => {
			const memberWeeks = reportedWeeks.filter(
				(week) => week.userId === userId,
			);
			const busy = (busyByUserId.get(userId) ?? []).filter((block) =>
				Availability.overlaps(block, window),
			);

			return {
				userId,
				// which week a window falls in goes by the member's own clock, the one they filled the week in on
				reported: memberWeeks.some(
					(week) =>
						Availability.weekStartsAt(
							databaseTimestampToDate(window.startsAt),
							week.timezone,
						) === week.weekStartsAt,
				),
				ranges: Availability.clip(
					Availability.subtract(
						memberWeeks.flatMap((week) => week.slots),
						busy,
					),
					window,
				),
				busy,
			};
		}),
	}));
}

type ReportedWeek = Awaited<
	ReturnType<typeof AvailabilityRepository.findAllWeeksByUserIds>
>[number];

function editorWeek({
	range,
	timezone,
	reportedWeeks,
}: {
	range: TimeRange;
	timezone: string;
	reportedWeeks: Array<ReportedWeek>;
}) {
	const matchingWeek = reportedWeeks.find((week) =>
		Availability.isSameWeek(week.weekStartsAt, range.startsAt),
	);

	const slots = DayTrack.splitByDayTracks(matchingWeek?.slots ?? [], timezone);

	const days = ScheduleWeek.days(range, timezone).map(({ date }) => ({
		date,
		ranges: DayTrack.mergedDayRanges(
			slots
				.filter(
					(slot) =>
						Availability.dateInTimezone(slot.startsAt, timezone) === date,
				)
				.map((slot) => slotToDayRange(slot, timezone)),
		),
		note: matchingWeek ? noteOfDay(matchingWeek, date, timezone) : "",
	}));

	return {
		weekStartsAt: range.startsAt,
		weekNumber: ScheduleWeek.weekNumber(range, timezone),
		submitted: Boolean(matchingWeek),
		days,
	};
}

function slotToDayRange(slot: TimeRange, timezone: string): DayTimeRange {
	const date = Availability.dateInTimezone(slot.startsAt, timezone);

	return {
		start: DayTrack.timestampToDayMinutes({
			date,
			timestamp: slot.startsAt,
			timezone,
		}),
		end: DayTrack.timestampToDayMinutes({
			date,
			timestamp: slot.endsAt,
			timezone,
		}),
	};
}

function noteOfDay(week: ReportedWeek, date: string, timezone: string) {
	return (
		week.dayNotes.find(
			(note) =>
				Availability.dateAcrossTimezones({
					date: note.date,
					from: week.timezone,
					to: timezone,
				}) === date,
		)?.text ?? ""
	);
}

function weekView({ range, timezone }: { range: TimeRange; timezone: string }) {
	const dates = ScheduleWeek.days(range, timezone);
	const dayStartsAt = (dayIndex: number) =>
		dayIndex === 7
			? range.endsAt
			: Availability.localToTimestamp({
					date: dates[dayIndex].date,
					time: "00:00",
					timezone,
				});

	return {
		startsAt: range.startsAt,
		endsAt: range.endsAt,
		weekNumber: ScheduleWeek.weekNumber(range, timezone),
		days: R.range(0, 7).map((dayIndex) => {
			const startsAt = dayStartsAt(dayIndex);

			return {
				startsAt,
				endsAt: dayStartsAt(dayIndex + 1),
				noonAt: startsAt + DAY_SECONDS / 2,
			};
		}),
	};
}
