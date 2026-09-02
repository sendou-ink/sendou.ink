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
import * as ScheduleWeek from "../core/ScheduleWeek";

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
	reportedWeeks: Array<ScheduleWeek.ReportedWeek>;
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

	const days = ScheduleWeek.days(range, timezone).map((day) => ({
		...day,
		windowTier: bestWindowTierOfDay({ date: day.date, windows, timezone }),
	}));

	const members = memberIds.map((userId) =>
		ScheduleWeek.memberRow({
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
		weekNumber: ScheduleWeek.weekNumber(range, timezone),
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

/** Tier of the best playable window starting on the viewer-local day (the day it renders its grid ranges on). */
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
