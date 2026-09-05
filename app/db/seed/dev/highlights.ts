import * as ResultHighlightFactory from "../factories/ResultHighlightFactory";
import type { SeededCalendarEvents } from "./calendar";
import type { SeededTournaments } from "./tournaments";
import type { SeededUsers } from "./users";

/** Few enough that the highlights view of N-ZAP's results page is a page shorter than the full one. */
const NZAP_CALENDAR_HIGHLIGHT_COUNT = 6;

/** Gives N-ZAP a highlighted results widget and a results page opening on the highlights view. */
export async function seedResultHighlights({
	users,
	calendarEvents,
	tournaments,
}: {
	users: SeededUsers;
	calendarEvents: SeededCalendarEvents;
	tournaments: SeededTournaments;
}) {
	await ResultHighlightFactory.replaceAll({
		userId: users.nzapId,
		resultTeamIds: calendarEvents.nzapResultTeamIds.slice(
			0,
			NZAP_CALENDAR_HIGHLIGHT_COUNT,
		),
		resultTournamentTeamIds: tournaments.nzapTeamIds,
	});
}
