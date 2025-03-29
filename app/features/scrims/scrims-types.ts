import type { CommonUser } from "../../utils/kysely.server";
import type { LUTI_DIVS } from "./scrims-constants";

export type LutiDiv = (typeof LUTI_DIVS)[number];

export interface ScrimPost {
	id: number;
	at: number;
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
	permissions: {
		MANAGE_REQUESTS: number[];
		DELETE_POST: number[];
	};
}

export interface ScrimPostRequest {
	id: number;
	isAccepted: boolean;
	users: Array<ScrimPostUser>;
	team: ScrimPostTeam | null;
	createdAt: number;
}

interface ScrimPostUser extends CommonUser {
	isOwner: boolean;
}

interface ScrimPostTeam {
	name: string;
	customUrl: string;
	avatarUrl: string | null;
}
