import { addDays, addWeeks, subMonths } from "date-fns";
import type { TimeRange } from "~/features/availability/availability-types";
import * as Availability from "~/features/availability/core/Availability";
import { dateToYYYYMMDD } from "~/utils/dates";
import * as AvailabilityWeekFactory from "../factories/AvailabilityWeekFactory";
import * as TeamEventFactory from "../factories/TeamEventFactory";
import type { SeededMisc } from "./misc";
import type { SeededScrims } from "./scrims-lfg";
import type { SeededTeams } from "./teams";
import type { SeededTournaments } from "./tournaments";
import type { SeededUsers } from "./users";

const HOUR = 60 * 60;
/** How long ago the week seeded for the cleanup routine to delete ended. */
const OLD_WEEK_MONTHS = 4;
/** A showcase user who is neither a teammate nor a friend of the admin, so their availability must show up nowhere. */
const STRANGER_SHOWCASE_INDEX = 30;

/** Ranges of one day, `HH:mm`. An end at or before the start crosses midnight. */
type DaySchedule = Array<[start: string, end: string]>;

/** Ranges of a week, Monday first. A day with no ranges is one the user is not available on. */
type WeekSchedule = [
	DaySchedule,
	DaySchedule,
	DaySchedule,
	DaySchedule,
	DaySchedule,
	DaySchedule,
	DaySchedule,
];

type SeededSchedule = {
	userId: number;
	timezone: string;
	weekly: WeekSchedule;
	/** Notes of the week, keyed by the day of it they are on. */
	notes?: Record<number, string>;
	/** Whether next week is reported too. Everybody but the admin fills it in, so that the admin has the "next week is empty" nudge waiting for them. */
	fillsNextWeek?: boolean;
};

const EMPTY_WEEK: WeekSchedule = [[], [], [], [], [], [], []];

const EVENINGS: WeekSchedule = [
	[["18:00", "22:00"]],
	[["18:00", "22:00"]],
	[["19:00", "23:00"]],
	[["18:00", "22:00"]],
	[],
	[["12:00", "22:00"]],
	[["12:00", "18:00"]],
];

/**
 * The admin's team, friends and a stranger, this week and next. The admin's team covers every state: a filled
 * week, one submitted as unavailable, one nobody reported, midnight-crossing ranges, day notes, commitments.
 */
export async function seedAvailability({
	users,
	teams,
	tournaments,
	scrims,
	misc,
}: {
	users: SeededUsers;
	teams: SeededTeams;
	tournaments: SeededTournaments;
	scrims: SeededScrims;
	misc: SeededMisc;
}) {
	const now = new Date();
	const [, multiRangeId, crossMidnightId, unavailableId, weekendId] =
		teams.allianceRogue.playerUserIds;

	// with room around them so the commitment visibly takes availability back
	const commitments = [
		{
			userId: users.adminId,
			startsAt: scrims.accepted.startsAt - HOUR,
			endsAt: scrims.accepted.startsAt + 2 * HOUR,
		},
		// reg open tournament: fully available, available from an hour in, not available at all
		{
			userId: users.adminId,
			startsAt: tournaments.regOpen.startsAt - HOUR,
			endsAt: tournaments.regOpen.startsAt + 4 * HOUR,
		},
		{
			userId: multiRangeId,
			startsAt: tournaments.regOpen.startsAt - HOUR,
			endsAt: tournaments.regOpen.startsAt + 4 * HOUR,
		},
		{
			userId: weekendId,
			startsAt: tournaments.regOpen.startsAt + HOUR,
			endsAt: tournaments.regOpen.startsAt + 4 * HOUR,
		},
	];

	const schedules: Array<SeededSchedule> = [
		// N-ZAP reports nothing, so the Monday reminder routine has someone to nudge
		{
			userId: users.adminId,
			timezone: "Europe/Helsinki",
			weekly: EVENINGS,
		},
		{
			userId: multiRangeId,
			timezone: "Europe/Stockholm",
			weekly: [
				[["17:00", "22:00"]],
				[["17:00", "22:00"]],
				[
					["13:00", "15:00"],
					["18:00", "22:00"],
				],
				[["17:00", "22:00"]],
				[["17:00", "22:00"]],
				[["09:00", "21:00"]],
				[],
			],
			notes: {
				2: "Have to stop earlier, work trip next morning",
				5: "Can play all day",
			},
			fillsNextWeek: true,
		},
		{
			userId: crossMidnightId,
			timezone: "Europe/London",
			weekly: [
				[["16:00", "20:00"]],
				[["16:00", "19:00"]],
				[],
				[["16:00", "20:00"]],
				[],
				[["22:00", "02:00"]],
				[],
			],
			fillsNextWeek: true,
		},
		{
			userId: unavailableId,
			timezone: "Europe/Helsinki",
			weekly: EMPTY_WEEK,
			fillsNextWeek: true,
		},
		{
			userId: weekendId,
			timezone: "Europe/Helsinki",
			weekly: [
				[["18:00", "22:00"]],
				[],
				[["19:00", "22:00"]],
				[["19:00", "22:00"]],
				[],
				[["12:00", "20:00"]],
				[],
			],
			fillsNextWeek: true,
		},
		{
			userId: teams.allianceRogue.subUserId,
			timezone: "Europe/Helsinki",
			// Wednesday ends exactly at midnight, as the drag editor produces at the 00:00 tick
			weekly: [[], [["18:00", "22:00"]], [["18:00", "00:00"]], [], [], [], []],
			fillsNextWeek: true,
		},
		{
			userId: teams.allianceRogue.coachUserId,
			timezone: "America/Los_Angeles",
			weekly: [
				[["09:00", "13:00"]],
				[],
				[["09:00", "13:00"]],
				[],
				[],
				[["15:00", "19:00"]],
				[],
			],
			fillsNextWeek: true,
		},
		// the last friend reports nothing, giving the friends page a schedule-less row to sort last
		...misc.adminFriendIds.slice(0, -1).map((userId, index) => ({
			userId,
			timezone: "Europe/Helsinki",
			weekly: EVENINGS,
			fillsNextWeek: index > 0,
		})),
		{
			userId: users.showcaseIds[STRANGER_SHOWCASE_INDEX],
			timezone: "Europe/Helsinki",
			weekly: EVENINGS,
			fillsNextWeek: true,
		},
	];

	// the friends the admin could ask to sub are free when the tournament runs
	for (const friendId of misc.adminFriendIds.slice(0, 2)) {
		commitments.push({
			userId: friendId,
			startsAt: tournaments.regOpen.startsAt - HOUR,
			endsAt: tournaments.regOpen.startsAt + 4 * HOUR,
		});
	}

	for (const schedule of schedules) {
		const dates = schedule.fillsNextWeek ? [now, addWeeks(now, 1)] : [now];

		for (const date of dates) {
			await seedWeek({ schedule, date, commitments });
		}
	}

	// a week the cleanup routine has a reason to delete
	await seedWeek({
		schedule: {
			userId: multiRangeId,
			timezone: "Europe/Stockholm",
			weekly: EVENINGS,
		},
		date: subMonths(now, OLD_WEEK_MONTHS),
		commitments: [],
	});

	await seedTeamEvents({ users, teams, now });
}

async function seedWeek({
	schedule,
	date,
	commitments,
}: {
	schedule: SeededSchedule;
	date: Date;
	commitments: Array<TimeRange & { userId: number }>;
}) {
	const { startsAt: weekStartsAt, endsAt: weekEndsAt } = Availability.weekRange(
		date,
		schedule.timezone,
	);
	const dates = datesOfWeek(weekStartsAt, schedule.timezone);

	const slots = schedule.weekly.flatMap((day, dayIndex) =>
		day.map(([start, end]) => ({
			startsAt: Availability.localToTimestamp({
				date: dates[dayIndex],
				time: start,
				timezone: schedule.timezone,
			}),
			endsAt: Availability.localToTimestamp({
				date: end <= start ? dates[dayIndex + 1] : dates[dayIndex],
				time: end,
				timezone: schedule.timezone,
			}),
		})),
	);

	const commitmentSlots = commitments.filter(
		(commitment) =>
			commitment.userId === schedule.userId &&
			commitment.startsAt >= weekStartsAt &&
			commitment.startsAt < weekEndsAt,
	);

	await AvailabilityWeekFactory.create({
		userId: schedule.userId,
		weekStartsAt,
		timezone: schedule.timezone,
		slots: Availability.normalize([...slots, ...commitmentSlots]),
		dayNotes: Object.entries(schedule.notes ?? {}).map(([dayIndex, text]) => ({
			date: dates[Number(dayIndex)],
			text,
		})),
	});
}

async function seedTeamEvents({
	users,
	teams,
	now,
}: {
	users: SeededUsers;
	teams: SeededTeams;
	now: Date;
}) {
	const timezone = "Europe/Helsinki";
	const events = [
		{
			date: now,
			name: "VoD review vs. FTWin",
			day: 1,
			start: "20:00",
			end: "21:30",
		},
		{
			date: addWeeks(now, 1),
			name: "Team meeting",
			day: 2,
			start: "19:00",
			end: "20:00",
		},
	];

	for (const event of events) {
		const { startsAt: weekStartsAt } = Availability.weekRange(
			event.date,
			timezone,
		);
		const dates = datesOfWeek(weekStartsAt, timezone);

		await TeamEventFactory.create({
			teamId: teams.allianceRogueId,
			// N-ZAP owns the team, so they are who can add an event to it
			authorId: users.nzapId,
			name: event.name,
			startsAt: Availability.localToTimestamp({
				date: dates[event.day],
				time: event.start,
				timezone,
			}),
			endsAt: Availability.localToTimestamp({
				date: dates[event.day],
				time: event.end,
				timezone,
			}),
		});
	}
}

/** The eight dates a week's days can fall on, the Monday after it included so that a range crossing midnight has one. */
function datesOfWeek(weekStartsAt: number, timezone: string) {
	const monday = new Date(
		`${Availability.dateInTimezone(weekStartsAt + 12 * HOUR, timezone)}T12:00:00Z`,
	);

	return Array.from({ length: 8 }, (_, index) =>
		dateToYYYYMMDD(addDays(monday, index)),
	);
}
