const ENGLISH_PLURAL_SUFFIXES = ["_one", "_other"] as const;

export type Translations = Record<string, Record<string, string>>;

export type TranslationDraft = {
	value: string;
	/** The English text the draft was translated from */
	source: string;
};

/** Namespace -> key -> draft */
export type TranslationDrafts = Record<
	string,
	Record<string, TranslationDraft>
>;

export type TranslationForm = {
	/** Key in the language's translation json */
	key: string;
	/** `null` if the unit is not pluralized */
	pluralCategory: Intl.LDMLPluralRule | null;
	/** The English text this form is translated from */
	source: string;
};

/** One translatable string, which consists of several forms in the case of a pluralized string */
export type TranslationUnit = {
	namespace: string;
	/** The key without its plural suffix */
	id: string;
	isPlural: boolean;
	forms: TranslationForm[];
};

/**
 * Every translatable unit of the language derived from the English translations. A pluralized English
 * string (`x_one` & `x_other`) is expanded into the plural categories of the language, using the bare key
 * for languages with only one category (what `pnpm run i18n:sync` produces).
 *
 * @example
 * TranslationUnits.fromEnglish({ english: { user: { "sets_one": "{{count}} set", "sets_other": "{{count}} sets" } }, language: "pl" });
 * // [{ namespace: "user", id: "sets", isPlural: true, forms: [{ key: "sets_one", ... }, { key: "sets_few", ... }, ...] }]
 */
export function fromEnglish({
	english,
	language,
	excludedNamespaces = [],
}: {
	english: Translations;
	language: string;
	excludedNamespaces?: readonly string[];
}): TranslationUnit[] {
	const pluralCategories = new Intl.PluralRules(language).resolvedOptions()
		.pluralCategories;

	const result: TranslationUnit[] = [];

	for (const [namespace, keys] of Object.entries(english)) {
		if (excludedNamespaces.includes(namespace)) continue;

		const handledPluralIds = new Set<string>();

		for (const [key, source] of Object.entries(keys)) {
			const pluralId = englishPluralId(keys, key);

			if (!pluralId) {
				result.push({
					namespace,
					id: key,
					isPlural: false,
					forms: [{ key, pluralCategory: null, source }],
				});
				continue;
			}

			if (handledPluralIds.has(pluralId)) continue;
			handledPluralIds.add(pluralId);

			const singular = keys[`${pluralId}_one`];
			const plural = keys[`${pluralId}_other`];

			result.push({
				namespace,
				id: pluralId,
				isPlural: true,
				forms: pluralCategories.map((category) => ({
					key:
						pluralCategories.length === 1
							? pluralId
							: `${pluralId}_${category}`,
					pluralCategory: category,
					source:
						category === "one" ? (singular ?? plural) : (plural ?? singular),
				})),
			});
		}
	}

	return result;
}

/** Units in the namespace (`null` for all) whose key, English text or translation contains the search */
export function filter({
	units,
	translations,
	namespace,
	search,
}: {
	units: TranslationUnit[];
	translations: Translations;
	namespace: string | null;
	search: string;
}) {
	const needle = search.trim().toLowerCase();

	return units.filter((unit) => {
		if (namespace !== null && unit.namespace !== namespace) return false;
		if (!needle) return true;

		return [
			unit.id,
			...unit.forms.flatMap((form) => [
				form.source,
				translations[unit.namespace]?.[form.key] ?? "",
			]),
		].some((text) => text.toLowerCase().includes(needle));
	});
}

/** The unit with the current translation of each of its forms, empty string when untranslated */
export function withTranslations(
	unit: TranslationUnit,
	translations: Translations,
) {
	return {
		...unit,
		forms: unit.forms.map((form) => ({
			...form,
			translation: translations[unit.namespace]?.[form.key] ?? "",
		})),
	};
}

/** Whether every form of the unit has a translation */
export function isTranslated(
	unit: TranslationUnit,
	translations: Translations,
): boolean {
	return unit.forms.every((form) =>
		Boolean(translations[unit.namespace]?.[form.key]),
	);
}

/** Count of units and how many of them are fully translated */
export function progress(
	units: TranslationUnit[],
	translations: Translations,
): { total: number; translated: number } {
	return {
		total: units.length,
		translated: units.filter((unit) => isTranslated(unit, translations)).length,
	};
}

/**
 * Whether a draft written for the form is still worth merging: the English text it was translated from is
 * unchanged and it differs from the current translation.
 */
export function isDraftPending({
	form,
	draft,
	currentTranslation,
}: {
	form: TranslationForm;
	draft: TranslationDraft;
	currentTranslation: string | undefined;
}): boolean {
	return draft.source === form.source && draft.value !== currentTranslation;
}

function englishPluralId(keys: Record<string, string>, key: string) {
	const suffix = ENGLISH_PLURAL_SUFFIXES.find((sfx) => key.endsWith(sfx));
	if (!suffix) return null;

	const id = key.slice(0, -suffix.length);
	if (keys[id] !== undefined) return null;

	return id;
}
