import type { Tables } from "~/db/tables";
import { isAdmin } from "./modules/permissions/utils";
import { allTruthy } from "./utils/arrays";
import { databaseTimestampToDate } from "./utils/dates";

// TODO: move to permissions module and generalize a lot of the logic

interface CanEditCalendarEventArgs {
	user?: Pick<Tables["User"], "id">;
	event: Pick<Tables["CalendarEvent"], "authorId">;
}
export function canEditCalendarEvent({
	user,
	event,
}: CanEditCalendarEventArgs) {
	if (isAdmin(user)) return true;

	return user?.id === event.authorId;
}

export function canDeleteCalendarEvent({
	user,
	event,
	startTime,
}: CanEditCalendarEventArgs & { startTime: Date }) {
	if (isAdmin(user)) return true;

	return user?.id === event.authorId && startTime > new Date();
}

interface CanReportCalendarEventWinnersArgs {
	user?: Pick<Tables["User"], "id">;
	event: Pick<Tables["CalendarEvent"], "authorId">;
	startTimes: number[];
}
export function canReportCalendarEventWinners({
	user,
	event,
	startTimes,
}: CanReportCalendarEventWinnersArgs) {
	return allTruthy([
		canEditCalendarEvent({ user, event }),
		eventStartedInThePast(startTimes),
	]);
}

function eventStartedInThePast(
	startTimes: CanReportCalendarEventWinnersArgs["startTimes"],
) {
	return startTimes.every(
		(startTime) =>
			databaseTimestampToDate(startTime).getTime() < new Date().getTime(),
	);
}
