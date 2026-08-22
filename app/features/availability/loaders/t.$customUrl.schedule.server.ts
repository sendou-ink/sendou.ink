import { addWeeks } from "date-fns";
import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import * as v from "valibot";
import { getUser } from "~/features/auth/core/user.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { teamParamsSchema } from "~/features/team/team-schemas.server";
import { getMemberRoleType, isTeamMember } from "~/features/team/team-utils";
import { getViewerTimezone } from "~/features/timezone/timezone-context.server";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish } from "~/utils/remix.server";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { AVAILABILITY } from "../availability-constants";
import type { PlayableWindowTier, TimeRange } from "../availability-types";
import * as Availability from "../core/Availability";

const DAY_SECONDS = 24 * 60 * 60;
/** A member's reported week belongs to a viewer week when their starts are closer than this — timezones set them apart by hours, never by days. */
const WEEK_MATCH_MAX_DISTANCE_SECONDS = 3.5 * DAY_SECONDS;

export type TeamScheduleLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { customUrl } = v.parse(teamParamsSchema, params);

	const team = notFoundIfNullish(
		await TeamRepository.findByCustomUrl(customUrl),
	);

	if (!isTeamMember({ team, user: getUser() })) {
		return { weeks: null };
	}

	const members = team.members.filter(
		(member) => member.role !== "CHEERLEADER",
	);
	const timezone = getViewerTimezone() ?? "UTC";
	const now = new Date();

	const reportedWeeks = await AvailabilityRepository.findAllWeeksByUserIds({
		userIds: members.map((member) => member.id),
		startsAt: Availability.weekRange(now, timezone).startsAt,
		endsAt: Availability.weekRange(
			addWeeks(now, AVAILABILITY.WEEK_HORIZON - 1),
			timezone,
		).endsAt,
	});

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
			}),
		),
	};
};

type ReportedWeek = Awaited<
	ReturnType<typeof AvailabilityRepository.findAllWeeksByUserIds>
>[number];

function weekView({
	range,
	timezone,
	memberIds,
	playerIds,
	reportedWeeks,
}: {
	range: TimeRange;
	timezone: string;
	memberIds: Array<number>;
	playerIds: Array<number>;
	reportedWeeks: Array<ReportedWeek>;
}) {
	const minPlayers = Math.min(
		AVAILABILITY.DEFAULT_MIN_PLAYERS,
		playerIds.length,
	);

	const windows = Availability.playableWindows({
		members: playerIds.map((userId) => ({
			userId,
			ranges: Availability.clip(
				reportedWeeks
					.filter((week) => week.userId === userId)
					.flatMap((week) => week.slots),
				range,
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
		memberWeekRow({ userId, days, timezone, reportedWeeks, range }),
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
}: {
	userId: number;
	days: Array<{ date: string; noonAt: number }>;
	timezone: string;
	reportedWeeks: Array<ReportedWeek>;
	range: TimeRange;
}) {
	const memberWeeks = reportedWeeks.filter((week) => week.userId === userId);
	const matchingWeek = memberWeeks.find(
		(week) =>
			Math.abs(week.weekStartsAt - range.startsAt) <
			WEEK_MATCH_MAX_DISTANCE_SECONDS,
	);

	if (!matchingWeek) {
		return {
			userId,
			reported: false,
			days: days.map(() => []) as Array<Array<TimeRange>>,
			notes: [] as Array<{ dayIndex: number; text: string }>,
		};
	}

	// slots are placed on the viewer-local day they start on, wherever their
	// author's week put them — the adjacent weeks' spillover included
	const slots = memberWeeks.flatMap((week) => week.slots);

	return {
		userId,
		reported: true,
		days: days.map((day) =>
			slots.filter(
				(slot) =>
					Availability.dateInTimezone(slot.startsAt, timezone) === day.date,
			),
		),
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
