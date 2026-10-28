import * as v from "valibot";
import * as PersistedState from "~/modules/persisted-state/persisted-state";

/** Whether the user has agreed to the trophy terms during this browser session */
export const trophyTermsAgreedPersisted = PersistedState.define({
	key: "trophyTermsAgreed",
	storage: "session",
	schema: v.boolean(),
	default: false,
});
