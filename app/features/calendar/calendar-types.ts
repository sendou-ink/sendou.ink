import type { CalendarEventTag, Tables } from "~/db/tables";
import type { RankedModeShort } from "~/modules/in-game-lists";
import type { CommonUser } from "~/utils/kysely.server";

interface CommonEvent {
	id: number;
	name: string;
	teamsCount: number;
	logoUrl: string | null;
	url: string;
	/** Is the tournament ranked? If null, tournament is not hosted on sendou.ink */
	isRanked: boolean | null;
	modes: RankedModeShort[] | "TABLETURF" | "SALMON_RUN" | null;
	organization: {
		name: string;
		slug: string;
	} | null;
}

export interface CalendarEvent extends CommonEvent {
	type: "calendar";
	tags: Array<CalendarEventTag>;
	/** Used for comparison, teams count where it is taken in account whether the tournament is 4v4, 3v3, 2v2 or 1v1 */
	normalizedTeamCount: number;
	/** For multi-day tournaments, which day of the event is this */
	day?: number;
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
	at: number;
	events: {
		shown: CalendarEvent[];
		hidden: CalendarEvent[];
	};
}
