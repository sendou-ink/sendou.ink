import * as v from "valibot";
import * as PersistedState from "~/modules/persisted-state/persisted-state";

/** The volume and mute state clips play at, remembered across visits. */
export const clipVolumePersisted = PersistedState.define({
	key: "scanner:clip-volume",
	storage: "local",
	schema: v.object({
		volume: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
		muted: v.boolean(),
	}),
	default: { volume: 1, muted: false },
});
