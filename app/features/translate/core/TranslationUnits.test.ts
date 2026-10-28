import { describe, expect, test } from "vitest";
import * as TranslationUnits from "./TranslationUnits";

const english = {
	common: {
		save: "Save",
		sets_one: "{{count}} set",
		sets_other: "{{count}} sets",
		prompt_one: "Add {{count}} sub",
		prompt_zero: "Roster is full",
		prompt_other: "Add {{count}} subs",
	},
	weapons: {
		MAIN_0: "Sploosh-o-matic",
	},
};

describe("TranslationUnits.fromEnglish", () => {
	test("plain key is a unit of one form", () => {
		const units = TranslationUnits.fromEnglish({ english, language: "de" });

		expect(units[0]).toEqual({
			namespace: "common",
			id: "save",
			isPlural: false,
			forms: [{ key: "save", pluralCategory: null, source: "Save" }],
		});
	});

	test("plural key expands to the plural categories of the language", () => {
		const units = TranslationUnits.fromEnglish({ english, language: "pl" });
		const sets = units.find((unit) => unit.id === "sets");

		expect(sets?.forms).toEqual([
			{ key: "sets_one", pluralCategory: "one", source: "{{count}} set" },
			{ key: "sets_few", pluralCategory: "few", source: "{{count}} sets" },
			{ key: "sets_many", pluralCategory: "many", source: "{{count}} sets" },
			{ key: "sets_other", pluralCategory: "other", source: "{{count}} sets" },
		]);
	});

	test("plural key of a single category language uses the bare key", () => {
		const units = TranslationUnits.fromEnglish({ english, language: "ja" });
		const sets = units.find((unit) => unit.id === "sets");

		expect(sets?.forms).toEqual([
			{ key: "sets", pluralCategory: "other", source: "{{count}} sets" },
		]);
	});

	test("zero override is a unit of its own", () => {
		const units = TranslationUnits.fromEnglish({ english, language: "de" });

		expect(units.map((unit) => unit.id)).toEqual([
			"save",
			"sets",
			"prompt",
			"prompt_zero",
			"MAIN_0",
		]);
	});

	test("skips excluded namespaces", () => {
		const units = TranslationUnits.fromEnglish({
			english,
			language: "de",
			excludedNamespaces: ["weapons"],
		});

		expect(units.some((unit) => unit.namespace === "weapons")).toBe(false);
	});
});

describe("TranslationUnits.progress", () => {
	test("counts a unit translated only when all its forms are", () => {
		const units = TranslationUnits.fromEnglish({
			english: { common: english.common },
			language: "de",
		});

		expect(
			TranslationUnits.progress(units, {
				common: {
					save: "Speichern",
					sets_one: "{{count}} Satz",
					sets_other: "",
				},
			}),
		).toEqual({ total: 4, translated: 1 });
	});
});

describe("TranslationUnits.isDraftPending", () => {
	const form = { key: "save", pluralCategory: null, source: "Save" };

	test.each([
		{
			why: "new translation",
			draft: { value: "Speichern", source: "Save" },
			currentTranslation: "",
			expected: true,
		},
		{
			why: "changed translation",
			draft: { value: "Sichern", source: "Save" },
			currentTranslation: "Speichern",
			expected: true,
		},
		{
			why: "already merged",
			draft: { value: "Speichern", source: "Save" },
			currentTranslation: "Speichern",
			expected: false,
		},
		{
			why: "English changed since",
			draft: { value: "Speichern", source: "Save it" },
			currentTranslation: "",
			expected: false,
		},
	])("$why", ({ draft, currentTranslation, expected }) => {
		expect(
			TranslationUnits.isDraftPending({ form, draft, currentTranslation }),
		).toBe(expected);
	});
});
