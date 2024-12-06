import type { CommonUser } from "../../utils/kysely.server";

type LutiDiv =
	| "X"
	| "1"
	| "2"
	| "3"
	| "4"
	| "5"
	| "6"
	| "7"
	| "8"
	| "9"
	| "10"
	| "11";

export interface ScrimPost {
	id: number;
	at: Date;
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
	requests: Array<{
		isAccepted: boolean;
		text: string | null;
		users: Array<ScrimPostUser>;
		team: ScrimPostTeam | null;
		createdAt: Date;
	}>;
}

interface ScrimPostUser extends CommonUser {
	isVerified: boolean;
}

interface ScrimPostTeam {
	name: string;
	customUrl: string;
	avatarUrl?: string;
}
