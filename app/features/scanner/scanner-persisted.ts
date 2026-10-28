import * as v from "valibot";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { DEFAULT_MONTAGE_CRITERIA } from "./core/montage";

/** What makes a montage clip candidate, an unreadable part falls back to its default */
export const montageCriteriaPersisted = PersistedState.define({
	key: "scanner:montage-criteria",
	storage: "local",
	schema: v.object({
		minKills: v.fallback(v.number(), DEFAULT_MONTAGE_CRITERIA.minKills),
		/** counts missing from it use the default */
		maxSecondsByKills: v.fallback(
			v.record(v.string(), v.number()),
			DEFAULT_MONTAGE_CRITERIA.maxSecondsByKills,
		),
	}),
	default: DEFAULT_MONTAGE_CRITERIA,
});

/** Base weapon ids (as strings, "null" for unknown) of the collapsed montage clip groups */
export const montageCollapsedGroupsPersisted = PersistedState.define({
	key: "scanner:montage-collapsed-groups",
	storage: "local",
	schema: v.array(v.string()),
	default: [],
});
