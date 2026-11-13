import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import { getUser } from "~/features/auth/core/user.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { teamParamsSchema } from "~/features/team/team-schemas.server";
import { getMemberRoleType, isTeamMember } from "~/features/team/team-utils";
import { getViewerTimezone } from "~/features/timezone/timezone-context.server";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { AVAILABILITY } from "../availability-constants";
import type { BusyBlock, TimeRange } from "../availability-types";
import * as Availability from "../core/Availability";
import * as ScheduleWeek from "../core/ScheduleWeek";
import * as VisibleSchedules from "../core/VisibleSchedules.server";

export type TeamScheduleLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { customUrl } = parseParams({ params, schema: teamParamsSchema });

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

	const members = team.members;
	const timezone = getViewerTimezone() ?? "UTC";
	const now = new Date();

	const horizon = {
		startsAt: Availability.weekRange(now, timezone).startsAt,
		endsAt: Availability.weekRange(now, timezone, AVAILABILITY.WEEK_HORIZON - 1)
			.endsAt,
	};
	const { reportedWeeks, busyByUserId } = await VisibleSchedules.findByUserIds({
		userIds: members.map((member) => member.id),
		viewerId: user.id,
		...horizon,
	});
	// team events are the team's own data, visible to every member no matter what they share
	const teamEvents = await AvailabilityRepository.findTeamEventsByTeamId({
		teamId: team.id,
		...horizon,
	});

	const playerIds = members
		.filter((member) => getMemberRoleType(member) !== "OTHER")
		.map((member) => member.id);

	return {
		weeks: R.range(0, AVAILABILITY.WEEK_HORIZON).map((weekOffset) =>
			weekView({
				range: Availability.weekRange(now, timezone, weekOffset),
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
	const { minPlayers, windows } = ScheduleWeek.teamWindows({
		range,
		playerIds,
		reportedWeeks,
		busyByUserId,
	});

	const days = ScheduleWeek.days(range, timezone).map((day) => ({
		...day,
		/** Local midnight starting the day. */
		startsAt: Availability.localToTimestamp({
			date: day.date,
			time: "00:00",
			timezone,
		}),
		windowTier: ScheduleWeek.bestWindowTierOfDay({
			date: day.date,
			windows,
			timezone,
		}),
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
		/** The viewer's, which the days are laid out in. */
		timezone,
		days,
		members,
		windows: windows.map((window) => R.omit(window, ["userIds"])),
		minPlayers,
		teamEvents: teamEvents.filter(
			(event) =>
				event.startsAt >= range.startsAt && event.startsAt < range.endsAt,
		),
	};
}
