import type { z } from "zod";
import type { CalendarEventTag, Tables } from "~/db/tables";
import type { calendarFiltersSearchParamsSchema } from "~/features/calendar/calendar-schemas";
import type { ModeShortWithSpecial } from "~/modules/in-game-lists/types";
import type { CommonUser } from "~/utils/kysely.server";

interface CommonEvent {
	id: number;
	name: string;
	teamsCount: number;
	logoUrl: string | null;
	url: string;
	/** Is the tournament ranked? If null, tournament is not hosted on sendou.ink */
	isRanked: boolean | null;
	modes: Array<ModeShortWithSpecial> | null;
	organization: {
		name: string;
		slug: string;
	} | null;
	/** User id of the author of the event */
	authorId: number;
}

export interface CalendarEvent extends CommonEvent {
	/** The date of the event in UNIX timestamp (JS format) */
	at: number;
	type: "calendar";
	tags: Array<CalendarEventTag>;
	/** Used for comparison, teams count where it is taken in account whether the tournament is 4v4, 3v3, 2v2 or 1v1 */
	normalizedTeamCount: number;
	/** For multi-day tournaments, which day of the event is this */
	day?: number;
	badges: Array<
		Pick<Tables["Badge"], "id" | "code" | "displayName" | "hue">
	> | null;
}

export interface ShowcaseCalendarEvent extends CommonEvent {
	type: "showcase";
	startTime: number;
	/** Tournament is hidden from the public (test tournament) */
	hidden: boolean;
	firstPlacer: {
		teamName: string;
		logoUrl: string | null;
		members: (CommonUser & { country: Tables["User"]["country"] })[];
		notShownMembersCount: number;
	} | null;
}

export interface GroupedCalendarEvents {
	/** The date of the event in UNIX timestamp (JS format) */
	at: number;
	events: {
		shown: CalendarEvent[];
		hidden: CalendarEvent[];
	};
}

export type CalendarFilters = z.infer<typeof calendarFiltersSearchParamsSchema>;
