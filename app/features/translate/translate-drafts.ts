import { usePersistedMapState } from "~/modules/persisted-state/hooks";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import type * as TranslationUnits from "./core/TranslationUnits";
import { draftsPersisted } from "./translate-persisted";

// Drafts are kept in the translator's browser, see `TranslationDrafts` for checking them against the current translations

const EMPTY_LANGUAGE: TranslationUnits.TranslationDrafts = {};

/** The language's drafts saved in this browser, empty during server rendering and hydration */
export function useTranslationDrafts(language: string) {
	return usePersistedMapState(draftsPersisted)[language] ?? EMPTY_LANGUAGE;
}

/** Saves the drafts of the namespace, `null` deletes the key's draft. False if the browser didn't allow storing them. */
export function updateDrafts({
	language,
	namespace,
	drafts,
}: {
	language: string;
	namespace: string;
	drafts: Record<string, TranslationUnits.TranslationDraft | null>;
}) {
	const namespaceDrafts = { ...readDrafts(language)[namespace] };
	for (const [key, draft] of Object.entries(drafts)) {
		if (draft) namespaceDrafts[key] = draft;
		else delete namespaceDrafts[key];
	}

	return writeLanguage(language, {
		...readDrafts(language),
		[namespace]: namespaceDrafts,
	});
}

/** Adds the drafts, replacing earlier drafts of the same keys */
export function addDrafts(
	language: string,
	drafts: TranslationUnits.TranslationDrafts,
) {
	const current = readDrafts(language);

	return writeLanguage(
		language,
		Object.fromEntries(
			[...new Set([...Object.keys(current), ...Object.keys(drafts)])].map(
				(namespace) => [
					namespace,
					{ ...current[namespace], ...drafts[namespace] },
				],
			),
		),
	);
}

export function deleteDrafts(
	language: string,
	keys: Array<{ namespace: string; key: string }>,
) {
	if (keys.length === 0) return;

	const next = structuredClone(readDrafts(language));
	for (const { namespace, key } of keys) {
		delete next[namespace]?.[key];
	}

	writeLanguage(language, next);
}

function readDrafts(language: string) {
	return PersistedState.readMap(draftsPersisted)[language] ?? EMPTY_LANGUAGE;
}

function writeLanguage(
	language: string,
	drafts: TranslationUnits.TranslationDrafts,
) {
	const nonEmpty = Object.fromEntries(
		Object.entries(drafts).filter(
			([, namespaceDrafts]) => Object.keys(namespaceDrafts).length > 0,
		),
	);

	return PersistedState.writeMapEntry(draftsPersisted, language, nonEmpty);
}
