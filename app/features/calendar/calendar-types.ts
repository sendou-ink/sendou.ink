import type { CalendarEventTag, Tables } from "~/db/tables";
import type { ShowcaseTournament } from "../front-page/core/ShowcaseTournaments.server";

export interface CalendarEvent
	extends Omit<
		ShowcaseTournament,
		"id" | "startTime" | "firstPlacer" | "isRanked"
	> {
	tags: Array<CalendarEventTag>;
	url: string;
	/** Is the tournament ranked? If null, tournament is not hosted on sendou.ink */
	isRanked: boolean | null;
	badges: Array<Pick<Tables["Badge"], "code" | "displayName" | "hue">>;
}

export interface GroupedCalendarEvents {
	date: Date;
	events: {
		shown: CalendarEvent[];
		hidden: CalendarEvent[];
	};
}
