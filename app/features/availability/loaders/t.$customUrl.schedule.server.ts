import { addWeeks } from "date-fns";
import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import * as v from "valibot";
import { getUser } from "~/features/auth/core/user.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { teamParamsSchema } from "~/features/team/team-schemas.server";
import { getMemberRoleType, isTeamMember } from "~/features/team/team-utils";
import { getViewerTimezone } from "~/features/timezone/timezone-context.server";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish } from "~/utils/remix.server";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { AVAILABILITY } from "../availability-constants";
import type {
	BusyBlock,
	PlayableWindowTier,
	TimeRange,
} from "../availability-types";
import * as Availability from "../core/Availability";
import * as Commitments from "../core/Commitments.server";

const DAY_SECONDS = 24 * 60 * 60;

export type TeamScheduleLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { customUrl } = v.parse(teamParamsSchema, params);

	const team = notFoundIfNullish(
		await TeamRepository.findByCustomUrl(customUrl),
	);

	const user = getUser();
	if (!user || !isTeamMember({ team, user })) {
		return { weeks: null };
	}

	await resolveNotifications({
		userIds: [user.id],
		type: "TEAM_EVENT_ADDED",
		meta: { teamCustomUrl: team.customUrl },
	});

	const members = team.members.filter(
		(member) => member.role !== "CHEERLEADER",
	);
	const timezone = getViewerTimezone() ?? "UTC";
	const now = new Date();

	const horizon = {
		startsAt: Availability.weekRange(now, timezone).startsAt,
		endsAt: Availability.weekRange(
			addWeeks(now, AVAILABILITY.WEEK_HORIZON - 1),
			timezone,
		).endsAt,
	};
	const [reportedWeeks, busyByUserId, teamEvents] = await Promise.all([
		AvailabilityRepository.findAllWeeksByUserIds({
			userIds: members.map((member) => member.id),
			...horizon,
		}),
		Commitments.busyBlocksByUserIds({
			userIds: members.map((member) => member.id),
			...horizon,
		}),
		AvailabilityRepository.findTeamEventsByTeamId({
			teamId: team.id,
			...horizon,
		}),
	]);

	const playerIds = members
		.filter((member) => getMemberRoleType(member) !== "OTHER")
		.map((member) => member.id);

	return {
		weeks: R.range(0, AVAILABILITY.WEEK_HORIZON).map((weekOffset) =>
			weekView({
				range: Availability.weekRange(addWeeks(now, weekOffset), timezone),
				timezone,
				memberIds: members.map((member) => member.id),
				playerIds,
				reportedWeeks,
				busyByUserId,
				teamEvents,
			}),
		),
	};
};

type TeamEventRow = Awaited<
	ReturnType<typeof AvailabilityRepository.findTeamEventsByTeamId>
>[number];

type ReportedWeek = Awaited<
	ReturnType<typeof AvailabilityRepository.findAllWeeksByUserIds>
>[number];

function weekView({
	range,
	timezone,
	memberIds,
	playerIds,
	reportedWeeks,
	busyByUserId,
	teamEvents,
}: {
	range: TimeRange;
	timezone: string;
	memberIds: Array<number>;
	playerIds: Array<number>;
	reportedWeeks: Array<ReportedWeek>;
	busyByUserId: Map<number, Array<BusyBlock>>;
	teamEvents: Array<TeamEventRow>;
}) {
	const minPlayers = Math.min(
		AVAILABILITY.DEFAULT_MIN_PLAYERS,
		playerIds.length,
	);

	const windows = Availability.playableWindows({
		members: playerIds.map((userId) => ({
			userId,
			ranges: Availability.subtract(
				Availability.clip(
					reportedWeeks
						.filter((week) => week.userId === userId)
						.flatMap((week) => week.slots),
					range,
				),
				busyByUserId.get(userId) ?? [],
			),
		})),
		minPlayers,
	}).map((window) => R.omit(window, ["userIds"]));

	const days = R.range(0, 7).map((dayIndex) => {
		const noonAt = range.startsAt + dayIndex * DAY_SECONDS + DAY_SECONDS / 2;
		const date = Availability.dateInTimezone(noonAt, timezone);

		return {
			date,
			noonAt,
			windowTier: bestWindowTierOfDay({ date, windows, timezone }),
		};
	});

	const members = memberIds.map((userId) =>
		memberWeekRow({
			userId,
			days,
			timezone,
			reportedWeeks,
			range,
			busy: busyByUserId.get(userId) ?? [],
		}),
	);

	return {
		startsAt: range.startsAt,
		weekNumber: Availability.isoWeekNumber(
			range.startsAt + DAY_SECONDS / 2,
			timezone,
		),
		days,
		members,
		windows,
		minPlayers,
		teamEvents: teamEvents.filter(
			(event) =>
				event.startsAt >= range.startsAt && event.startsAt < range.endsAt,
		),
	};
}

/**
 * Tier of the best playable window starting on the given viewer-local day, the
 * same day a window renders its grid ranges on.
 */
function bestWindowTierOfDay({
	date,
	windows,
	timezone,
}: {
	date: string;
	windows: Array<TimeRange & { tier: PlayableWindowTier }>;
	timezone: string;
}): PlayableWindowTier | null {
	const tiers = windows
		.filter(
			(window) =>
				Availability.dateInTimezone(window.startsAt, timezone) === date,
		)
		.map((window) => window.tier);

	if (tiers.includes("FULL")) return "FULL";
	if (tiers.includes("ONE_SHORT")) return "ONE_SHORT";
	return null;
}

function memberWeekRow({
	userId,
	days,
	timezone,
	reportedWeeks,
	range,
	busy,
}: {
	userId: number;
	days: Array<{ date: string; noonAt: number }>;
	timezone: string;
	reportedWeeks: Array<ReportedWeek>;
	range: TimeRange;
	busy: Array<BusyBlock>;
}) {
	const busyOfDay = (day: { date: string }) =>
		busy.filter(
			(block) =>
				Availability.dateInTimezone(block.startsAt, timezone) === day.date,
		);

	const memberWeeks = reportedWeeks.filter((week) => week.userId === userId);
	const matchingWeek = memberWeeks.find(
		(week) =>
			Math.abs(week.weekStartsAt - range.startsAt) <
			AVAILABILITY.WEEK_MATCH_MAX_DISTANCE_SECONDS,
	);

	if (!matchingWeek) {
		return {
			userId,
			reported: false,
			days: days.map((day) => ({
				ranges: [] as Array<TimeRange>,
				busy: busyOfDay(day),
			})),
			notes: [] as Array<{ dayIndex: number; text: string }>,
		};
	}

	// slots are placed on the viewer-local day they start on, wherever their
	// author's week put them — the adjacent weeks' spillover included. What a
	// commitment takes back is cut out first: the grid shows when the member
	// is actually free.
	const slots = Availability.subtract(
		memberWeeks.flatMap((week) => week.slots),
		busy,
	);

	return {
		userId,
		reported: true,
		days: days.map((day) => ({
			ranges: slots.filter(
				(slot) =>
					Availability.dateInTimezone(slot.startsAt, timezone) === day.date,
			),
			busy: busyOfDay(day),
		})),
		notes: memberWeeks.flatMap((week) =>
			week.dayNotes.flatMap((note) => {
				const noteDate = Availability.dateInTimezone(
					Availability.localToTimestamp({
						date: note.date,
						time: "12:00",
						timezone: week.timezone,
					}),
					timezone,
				);
				const dayIndex = days.findIndex((day) => day.date === noteDate);

				return dayIndex === -1 ? [] : [{ dayIndex, text: note.text }];
			}),
		),
	};
}
