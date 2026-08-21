import * as v from "valibot";
import type { PlusVoteFromFE } from "~/features/plus-voting/core";
import { preprocess, safeJSONParse } from "~/utils/schema";
import { assertType } from "~/utils/types";
import { PLUS_DOWNVOTE, PLUS_UPVOTE } from "./plus-voting-constants";

const voteSchema = v.object({
	votedId: v.number(),
	score: v.pipe(
		v.number(),
		v.check((val) => [PLUS_DOWNVOTE, PLUS_UPVOTE].includes(val)),
	),
});

assertType<v.InferOutput<typeof voteSchema>, PlusVoteFromFE>();

export const votingActionSchema = v.object({
	votes: preprocess(safeJSONParse, v.array(voteSchema)),
});
