import * as v from "valibot";
import * as PersistedState from "~/modules/persisted-state/persisted-state";

export const devToolbarPersisted = PersistedState.define({
	key: "dev-toolbar",
	storage: "local",
	schema: v.object({ isMinimized: v.boolean() }),
	default: { isMinimized: false },
});

/** Whether running a scenario logs in as its user, or only opens its page as whoever you are. */
export const scenarioLogInPersisted = PersistedState.define({
	key: "dev-scenario-log-in",
	storage: "local",
	schema: v.boolean(),
	default: true,
});

/** The parameters each scenario was last run with, keyed by scenario id. */
export const scenarioParamsPersisted = PersistedState.defineMap({
	keyPrefix: "dev-scenario-params__",
	storage: "local",
	schema: v.record(v.string(), v.union([v.string(), v.number()])),
	default: {},
});
