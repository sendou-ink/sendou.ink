import type { Tables } from "#lib/server/db/tables.ts";
import type { CommonUser } from "#lib/server/kysely.ts";

interface CommonEvent {
	id: number;
	name: string;
	teamsCount: number;
	/** How many players in total are rostered in the counted teams */
	membersCount: number;
	minMembersPerTeam: number;
	logoUrl: string | null;
	url: string;
	/** Is the tournament ranked? If null, tournament is not hosted on sendou.ink */
	isRanked: boolean | null;
	/** Tournament tier (1=X, 2=S+, 3=S, 4=A+, 5=A, 6=B+, 7=B, 8=C+, 9=C). Null if not tiered. */
	tier: number | null;
	/** Tentative tier prediction based on series history. Displayed with ~ prefix. */
	tentativeTier: number | null;
	modes: Array<string> | null;
	organization: {
		name: string;
		slug: string;
	} | null;
	/** User id of the author of the event */
	authorId: number;
}

export interface ShowcaseCalendarEvent extends CommonEvent {
	type: "showcase";
	startsAt: number;
	/** Id of the organization the event belongs to, if any */
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
