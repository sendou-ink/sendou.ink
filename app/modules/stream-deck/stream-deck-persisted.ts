import * as v from "valibot";
import * as PersistedState from "~/modules/persisted-state/persisted-state";

/** Whether a Stream Deck allowed before connects by itself, off once it is disconnected. */
export const streamDeckAutoConnectPersisted = PersistedState.define({
	key: "stream-deck-auto-connect",
	storage: "local",
	schema: v.boolean(),
	default: true,
});
