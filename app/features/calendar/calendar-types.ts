import type * as v from "valibot";
import type { Tables } from "~/db/tables";
import type { tags } from "~/features/calendar/calendar-constants";
import type { calendarFiltersSearchParamsSchema } from "~/features/calendar/calendar-schemas";
import type { ModeShortWithSpecial } from "~/modules/in-game-lists/types";
import type { CommonUser } from "~/utils/kysely.server";

export type CalendarEventTag = keyof typeof tags;

interface CommonEvent {
	id: number;
	name: string;
	teamsCount: number;
	/** Players rostered in the counted teams in total */
	membersCount: number;
	minMembersPerTeam: number;
	logoUrl: string | null;
	url: string;
	/** Null when not hosted on sendou.ink */
	isRanked: boolean | null;
	/** Tournament tier (1=X, 2=S+, 3=S, 4=A+, 5=A, 6=B+, 7=B, 8=C+, 9=C). Null if not tiered. */
	tier: number | null;
	/** Tentative tier prediction based on series history. Displayed with ~ prefix. */
	tentativeTier: number | null;
	modes: Array<ModeShortWithSpecial> | null;
	organization: {
		name: string;
		slug: string;
	} | null;
	authorId: number;
}

export interface CalendarEvent extends CommonEvent {
	/** The date of the event in UNIX timestamp (JS format) */
	at: number;
	type: "calendar";
	tags: Array<CalendarEventTag>;
	/** Team count weighted by team size (4v4, 3v3, 2v2, 1v1), for comparison */
	normalizedTeamCount: number;
	/** For multi-day tournaments, which day of the event is this */
	day?: number;
	badges: Array<
		Pick<Tables["Badge"], "id" | "code" | "displayName" | "hue">
	> | null;
	trophy: Pick<Tables["Trophy"], "model"> | null;
}

export interface ShowcaseCalendarEvent extends CommonEvent {
	type: "showcase";
	startsAt: number;
	organizationId: number | null;
	/** Tournament is hidden from the public (test tournament) */
	hidden: boolean;
	isFinalized: boolean;
	firstPlacers: Array<{
		teamName: string;
		logoUrl: string | null;
		members: (CommonUser & { country: Tables["User"]["country"] })[];
		notShownMembersCount: number;
		div: string | null;
	}>;
	hasVods?: boolean;
}

export interface GroupedCalendarEvents {
	/** The date of the event in UNIX timestamp (JS format) */
	at: number;
	events: {
		shown: CalendarEvent[];
		hidden: CalendarEvent[];
	};
}

export type CalendarFilters = v.InferOutput<
	typeof calendarFiltersSearchParamsSchema
>;
