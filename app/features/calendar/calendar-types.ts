import type { CalendarEventTag, Tables } from "~/db/tables";
import type { CommonUser } from "~/utils/kysely.server";

interface CommonEvent {
	id: number;
	name: string;
	teamsCount: number;
	logoUrl: string | null;
	url: string;
	/** Is the tournament ranked? If null, tournament is not hosted on sendou.ink */
	isRanked: boolean | null;
	organization: {
		name: string;
		slug: string;
	} | null;
}

export interface CalendarEvent extends CommonEvent {
	type: "calendar";
	tags: Array<CalendarEventTag>;
	/** For multi-day tournaments, which day of the event is this */
	day?: number;
	badges: Array<Pick<Tables["Badge"], "code" | "displayName" | "hue">>;
}

export interface ShowcaseCalendarEvent extends CommonEvent {
	type: "showcase";
	startTime: number;
	firstPlacer: {
		teamName: string;
		logoUrl: string | null;
		members: (CommonUser & { country: Tables["User"]["country"] })[];
		notShownMembersCount: number;
	} | null;
}

export interface GroupedCalendarEvents {
	date: Date;
	events: {
		shown: CalendarEvent[];
		hidden: CalendarEvent[];
	};
}
