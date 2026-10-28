import * as v from "valibot";
import * as PersistedState from "~/modules/persisted-state/persisted-state";

/** Sound code -> whether the sound plays */
export const soundEnabledPersisted = PersistedState.defineMap({
	keyPrefix: "settings__sound-enabled__",
	storage: "local",
	schema: v.boolean(),
	default: true,
});

/** Volume of every sound, 0-100 */
export const soundVolumePersisted = PersistedState.define({
	key: "settings__sound-volume",
	storage: "local",
	schema: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
	default: 100,
});

/** Cooldown key -> timestamp (ms) the cooldown ends, shared between tabs */
export const cooldownsPersisted = PersistedState.define({
	key: "chat__cooldowns",
	storage: "local",
	schema: v.record(v.string(), v.number()),
	default: {},
});

/** Id of the tab the user last paid attention to, `null` before any */
export const lastActiveTabPersisted = PersistedState.define({
	key: "chat__last-active-tab",
	storage: "local",
	schema: v.nullable(v.string()),
	default: null,
});
