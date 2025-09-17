import type { LUTI_DIVS } from '$lib/constants/scrim';
import type { AssociationVisibility } from '$lib/server/db/tables';
import type { CommonUser } from '../../utils/kysely.server';

export type LutiDiv = (typeof LUTI_DIVS)[number];

export interface ScrimPost {
	id: number;
	at: number;
	createdAt: Date;
	visibility: AssociationVisibility | null;
	text: string | null;
	divs: {
		/** Max div in the whole system is "X" */
		max: LutiDiv;
		/** Min div in the whole system is "11" */
		min: LutiDiv;
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
	};
	managedByAnyone: boolean;
	/** When the post was made was it scheduled for a future time slot (as opposed to looking now) */
	isScheduledForFuture: boolean;
	canceled: {
		at: Date;
		byUser: ScrimPostUser;
		reason: string;
	} | null;
}

export interface ScrimPostRequest {
	id: number;
	isAccepted: boolean;
	users: Array<ScrimPostUser>;
	team: ScrimPostTeam | null;
	permissions: {
		CANCEL: number[];
	};
	createdAt: Date;
}

export interface ScrimPostUser extends CommonUser {
	isOwner: boolean;
}

interface ScrimPostTeam {
	name: string;
	customUrl: string;
	avatarUrl: string | null;
}
