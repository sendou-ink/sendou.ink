import { describe, expect, test } from "vitest";
import * as TranslationDrafts from "./TranslationDrafts";

const catalog: TranslationDrafts.Catalog = {
	language: "de",
	english: {
		common: {
			save: "Save",
			by: "by {{author}}",
			sets_one: "{{count}} set",
			sets_other: "{{count}} sets",
		},
	},
	translations: {
		common: { save: "Speichern" },
	},
	inherited: {},
};

describe("TranslationDrafts.sort", () => {
	test("keeps drafts worth merging", () => {
		const { pending, obsolete } = TranslationDrafts.sort({
			catalog,
			drafts: {
				common: {
					by: { value: "von {{author}}", source: "by {{author}}" },
					sets_one: { value: "ein Satz", source: "{{count}} set" },
				},
			},
		});

		expect(pending).toEqual({
			common: { by: "von {{author}}", sets_one: "ein Satz" },
		});
		expect(obsolete).toEqual([]);
	});

	test.each([
		{
			why: "key no longer exists",
			key: "removed",
			draft: { value: "Weg", source: "Gone" },
		},
		{
			why: "English changed since",
			key: "by",
			draft: { value: "von {{author}}", source: "made by {{author}}" },
		},
		{
			why: "equal to the current translation",
			key: "save",
			draft: { value: "Speichern", source: "Save" },
		},
		{
			why: "broken syntax",
			key: "by",
			draft: { value: "von {{autor}}", source: "by {{author}}" },
		},
	])("marks obsolete when $why", ({ key, draft }) => {
		expect(
			TranslationDrafts.sort({ catalog, drafts: { common: { [key]: draft } } }),
		).toEqual({ pending: {}, obsolete: [{ namespace: "common", key }] });
	});
});

describe("TranslationDrafts.mergedFiles", () => {
	test("writes the drafts over the whole current file", () => {
		expect(
			TranslationDrafts.mergedFiles({
				catalog,
				pending: { common: { by: "von {{author}}" } },
			}),
		).toEqual({
			common: {
				save: "Speichern",
				by: "von {{author}}",
			},
		});
	});

	test("orders the keys like English", () => {
		const files = TranslationDrafts.mergedFiles({
			catalog: {
				...catalog,
				translations: { common: { by: "von {{author}}" } },
			},
			pending: { common: { save: "Speichern" } },
		});

		expect(Object.keys(files.common)).toEqual(["save", "by"]);
	});

	test("leaves out what a regional variant inherits from its parent language", () => {
		expect(
			TranslationDrafts.mergedFiles({
				catalog: {
					...catalog,
					language: "es-US",
					translations: { common: { save: "Guardar", by: "por {{author}}" } },
					inherited: { common: { save: "Guardar", by: "de {{author}}" } },
				},
				pending: { common: { sets_one: "{{count}} set" } },
			}),
		).toEqual({
			common: { by: "por {{author}}", sets_one: "{{count}} set" },
		});
	});
});

describe("TranslationDrafts.fromFiles", () => {
	test("takes the values that differ from the current translations", () => {
		expect(
			TranslationDrafts.fromFiles({
				catalog,
				files: {
					common: {
						save: "Speichern",
						by: "von {{author}}",
						sets_other: "{{count}} {{oops}}",
						unknown: "Unbekannt",
					},
					other: { save: "Sichern" },
				},
			}),
		).toEqual({
			common: { by: { value: "von {{author}}", source: "by {{author}}" } },
		});
	});
});
