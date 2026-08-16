import type { Tables } from "~/db/tables";

export interface MonthYear {
	month: number;
	year: number;
}

export type PlusVoteFromFE = Pick<Tables["PlusVote"], "votedId" | "score">;
