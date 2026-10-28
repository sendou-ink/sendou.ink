import * as v from "valibot";
import * as PersistedState from "~/modules/persisted-state/persisted-state";

/** Votes given so far in the ongoing voting, so a reload continues where the user left off */
export const plusVotingPersisted = PersistedState.define({
	key: "plusVoting",
	storage: "local",
	schema: v.nullable(
		v.object({
			month: v.number(),
			year: v.number(),
			votes: v.array(v.object({ votedId: v.number(), score: v.number() })),
			/** User id -> order for sorting */
			usersForVotingOrder: v.record(v.string(), v.number()),
		}),
	),
	default: null,
});
