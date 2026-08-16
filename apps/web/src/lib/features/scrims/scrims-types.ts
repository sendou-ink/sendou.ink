import type { AssociationVisibility } from "#lib/features/associations/associations-types.ts";
import type { CommonUser } from "#lib/server/kysely.ts";

export const LUTI_DIVS = [
	"X",
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
	"10",
	"11",
] as const;

export type LutiDiv = (typeof LUTI_DIVS)[number];

export interface ScrimPost {
	id: number;
	startsAt: number;
	rangeEndsAt: number | null;
	createdAt: number;
	visibility: AssociationVisibility | null;
	text: string | null;
	divs: {
		/** Max div in the whole system is "X" */
		max: LutiDiv;
		/** Min div in the whole system is "11" */
		min: LutiDiv;
	} | null;
	maps: "SZ" | "ALL" | "RANKED" | null;
	mapsTournament: {
		id: number;
		name: string;
		avatarUrl: string;
	} | null;
	team: ScrimPostTeam | null;
	users: Array<ScrimPostUser>;
	chatCode: string | null;
	requests: Array<ScrimPostRequest>;
	/** Is the post visible to the user because of their association membership? */
	isPrivate?: boolean;
	permissions: {
		MANAGE_REQUESTS: number[];
		DELETE_POST: number[];
		CANCEL: number[];
		MANAGE_TRACKING: number[];
	};
	managedByAnyone: boolean;
	/** When the post was made was it scheduled for a future time slot (as opposed to looking now) */
	isScheduledForFuture: boolean;
	canceled: {
		at: number;
		byUser: ScrimPostUser;
		reason: string;
	} | null;
}

export interface ScrimPostRequest {
	id: number;
	isAccepted: boolean;
	users: Array<ScrimPostUser>;
	team: ScrimPostTeam | null;
	message: string | null;
	startsAt: number | null;
	permissions: {
		CANCEL: number[];
	};
	createdAt: number;
}

export interface ScrimPostUser extends CommonUser {
	isOwner: boolean;
	inGameName: string | null;
}

interface ScrimPostTeam {
	name: string;
	customUrl: string;
	avatarUrl: string | null;
}
