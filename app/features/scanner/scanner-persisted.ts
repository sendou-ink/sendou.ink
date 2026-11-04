import * as v from "valibot";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import {
	type ClipCriteria,
	DEFAULT_VOD_CLIP_CRITERIA,
} from "./core/clips/criteria";
import { DEFAULT_MONTAGE_CRITERIA } from "./core/montage";

/** What makes a montage clip candidate, an unreadable part falls back to its default */
export const montageCriteriaPersisted = PersistedState.define({
	key: "scanner:montage-criteria",
	storage: "local",
	schema: clipCriteriaSchema(DEFAULT_MONTAGE_CRITERIA),
	default: DEFAULT_MONTAGE_CRITERIA,
});

/** What makes a clip of a scanned VoD, an unreadable part falls back to its default */
export const vodClipCriteriaPersisted = PersistedState.define({
	key: "scanner:vod-clip-criteria",
	storage: "local",
	schema: clipCriteriaSchema(DEFAULT_VOD_CLIP_CRITERIA),
	default: DEFAULT_VOD_CLIP_CRITERIA,
});

/** Base weapon ids (as strings, "null" for unknown) of the collapsed montage clip groups */
export const montageCollapsedGroupsPersisted = PersistedState.define({
	key: "scanner:montage-collapsed-groups",
	storage: "local",
	schema: v.array(v.string()),
	default: [],
});

function clipCriteriaSchema(defaults: ClipCriteria) {
	return v.object({
		minKills: v.fallback(v.number(), defaults.minKills),
		/** counts missing from it use the default */
		maxSecondsByKills: v.fallback(
			v.record(v.string(), v.number()),
			defaults.maxSecondsByKills,
		),
	});
}
