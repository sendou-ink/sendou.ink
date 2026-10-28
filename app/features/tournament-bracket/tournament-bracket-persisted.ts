import * as v from "valibot";
import * as PersistedState from "~/modules/persisted-state/persisted-state";

/** Bracket view (tournament, bracket & group) -> scroll position it was left at: of the bracket's own scroll container and the window, `null` before any */
export const bracketScrollPositionPersisted = PersistedState.defineMap({
	keyPrefix: "tournament-bracket__scroll__",
	storage: "session",
	schema: v.nullable(
		v.object({ left: v.number(), top: v.number(), windowY: v.number() }),
	),
	default: null,
});
