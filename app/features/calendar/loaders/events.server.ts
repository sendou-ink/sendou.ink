import { requireUser } from "~/features/auth/core/user.server";
import * as ScheduleViews from "~/features/availability/core/ScheduleViews.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as CalendarFeedRepository from "../CalendarFeedRepository.server";
import * as UserEvents from "../core/UserEvents.server";

export type EventsLoaderData = typeof loader;

export const loader = async () => {
	const user = requireUser();

	const events = await UserEvents.byCategory(user.id);
	const mySchedule = await ScheduleViews.myScheduleData(user.id);
	const myTeams = await TeamRepository.findAllMemberOfByUserId(user.id);
	const calendarFeedToken =
		(await CalendarFeedRepository.findOwnToken()) ?? null;

	return {
		...events,
		mySchedule,
		/** Audiences of the schedule visibility picker, alongside the user's friends. */
		myTeams: myTeams.map((myTeam) => ({ id: myTeam.id, name: myTeam.name })),
		calendarFeedToken,
	};
};
