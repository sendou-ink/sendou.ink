import * as TranslationSyntax from "./TranslationSyntax";
import * as TranslationUnits from "./TranslationUnits";

/** What drafts are checked against: the English translations and the language's current ones */
export type Catalog = {
	language: string;
	english: TranslationUnits.Translations;
	/** Includes what a regional variant inherits from its parent language */
	translations: TranslationUnits.Translations;
	/** What a regional variant inherits from its parent language, left out of its files */
	inherited: TranslationUnits.Translations;
};

const unitsCache = new WeakMap<
	TranslationUnits.Translations,
	Map<string, TranslationUnits.TranslationUnit[]>
>();

type DraftKey = { namespace: string; key: string };

/**
 * Splits the drafts into the ones still worth merging and obsolete ones: drafts of keys that no longer exist,
 * translated from English text that has changed since, equal to the current translation or with broken syntax.
 *
 * @example
 * TranslationDrafts.sort({ catalog, drafts: { common: { save: { value: "Speichern", source: "Save" } } } });
 * // { pending: { common: { save: "Speichern" } }, obsolete: [] }
 */
export function sort({
	catalog,
	drafts,
}: {
	catalog: Catalog;
	drafts: TranslationUnits.TranslationDrafts;
}) {
	const forms = formsByKey(units(catalog));
	const pending: TranslationUnits.Translations = {};
	const obsolete: DraftKey[] = [];

	for (const [namespace, namespaceDrafts] of Object.entries(drafts)) {
		for (const [key, draft] of Object.entries(namespaceDrafts)) {
			if (!isValid({ catalog, forms, namespace, key, draft })) {
				obsolete.push({ namespace, key });
				continue;
			}

			pending[namespace] ??= {};
			pending[namespace][key] = draft.value;
		}
	}

	return { pending, obsolete };
}

/**
 * Full translation jsons of the namespaces the pending drafts touch, the drafts written over the current
 * translations in English key order, as `pnpm run i18n:sync` writes them. A regional variant's files leave
 * out what equals its parent language's translation.
 */
export function mergedFiles({
	catalog,
	pending,
}: {
	catalog: Catalog;
	pending: TranslationUnits.Translations;
}): TranslationUnits.Translations {
	const catalogUnits = units(catalog);

	return Object.fromEntries(
		Object.entries(pending).map(([namespace, namespaceTranslations]) => {
			const merged = {
				...catalog.translations[namespace],
				...namespaceTranslations,
			};

			return [
				namespace,
				Object.fromEntries(
					catalogUnits
						.filter((unit) => unit.namespace === namespace)
						.flatMap((unit) => unit.forms.map((form) => form.key))
						.flatMap((key) => {
							const value = merged[key];
							if (value === undefined) return [];
							if (catalog.inherited[namespace]?.[key] === value) return [];

							return [[key, value]];
						}),
				),
			];
		}),
	);
}

/** Drafts from uploaded translation jsons (namespace -> parsed file): the values that differ from the current ones and keep the English syntax */
export function fromFiles({
	catalog,
	files,
}: {
	catalog: Catalog;
	files: Record<string, Record<string, unknown>>;
}): TranslationUnits.TranslationDrafts {
	const forms = formsByKey(units(catalog));
	const result: TranslationUnits.TranslationDrafts = {};

	for (const [namespace, file] of Object.entries(files)) {
		for (const [key, value] of Object.entries(file)) {
			const located = forms.get(formId(namespace, key));
			if (typeof value !== "string" || !located) continue;

			const draft = { value, source: located.form.source };
			if (!isValid({ catalog, forms, namespace, key, draft })) continue;

			result[namespace] ??= {};
			result[namespace][key] = draft;
		}
	}

	return result;
}

/** The catalog's translatable units, see {@link TranslationUnits.fromEnglish} */
export function units(catalog: Catalog): TranslationUnits.TranslationUnit[] {
	let byLanguage = unitsCache.get(catalog.english);
	if (!byLanguage) {
		byLanguage = new Map();
		unitsCache.set(catalog.english, byLanguage);
	}

	let result = byLanguage.get(catalog.language);
	if (!result) {
		result = TranslationUnits.fromEnglish({
			english: catalog.english,
			language: catalog.language,
		});
		byLanguage.set(catalog.language, result);
	}

	return result;
}

function isValid({
	catalog,
	forms,
	namespace,
	key,
	draft,
}: {
	catalog: Catalog;
	forms: ReturnType<typeof formsByKey>;
	namespace: string;
	key: string;
	draft: TranslationUnits.TranslationDraft;
}) {
	const located = forms.get(formId(namespace, key));
	if (!located) return false;

	return (
		TranslationUnits.isDraftPending({
			form: located.form,
			draft,
			currentTranslation: catalog.translations[namespace]?.[key],
		}) &&
		TranslationSyntax.validate({
			source: located.form.source,
			translation: draft.value,
			isPlural: located.unit.isPlural,
		}).length === 0
	);
}

function formsByKey(catalogUnits: TranslationUnits.TranslationUnit[]) {
	const result = new Map<
		string,
		{
			unit: TranslationUnits.TranslationUnit;
			form: TranslationUnits.TranslationForm;
		}
	>();
	for (const unit of catalogUnits) {
		for (const form of unit.forms) {
			result.set(formId(unit.namespace, form.key), { unit, form });
		}
	}

	return result;
}

function formId(namespace: string, key: string) {
	return `${namespace}:${key}`;
}
