import * as v from "valibot";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { TRANSLATABLE_LANGUAGES } from "./translate-constants";

/** Drafts written on the /translate page, per language: namespace -> key -> draft */
export const draftsPersisted = PersistedState.defineMap({
	keyPrefix: "translation-drafts__",
	storage: "local",
	schema: v.record(
		v.string(),
		v.record(v.string(), v.object({ value: v.string(), source: v.string() })),
	),
	default: {},
});

/** Language whose drafts are previewed on the site, `null` when not previewing */
export const previewLanguagePersisted = PersistedState.define({
	key: "translation-preview",
	storage: "local",
	schema: v.nullable(v.picklist(TRANSLATABLE_LANGUAGES)),
	default: null,
});
