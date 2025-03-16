import type { PlusVote } from "~/db/types";

export interface MonthYear {
	month: number;
	year: number;
}

export type PlusVoteFromFE = Pick<PlusVote, "votedId" | "score">;
