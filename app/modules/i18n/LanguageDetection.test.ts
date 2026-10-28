import { describe, expect, test } from "vitest";
import * as LanguageDetection from "./LanguageDetection";

const SITE_LANGUAGES = ["de", "en", "es-ES", "es-US", "fr-EU", "ja", "zh"];
const GAME_LANGUAGES = [...SITE_LANGUAGES, "fr-CA", "it", "ko", "nl", "ru"];

describe("LanguageDetection.acceptedLanguages", () => {
	test.each([
		{ why: "no header", header: null, expected: [] },
		{
			why: "ordered by quality",
			header: "en;q=0.5, fr-CH, fr;q=0.9",
			expected: ["fr-CH", "fr", "en"],
		},
		{
			why: "drops q=0 and malformed tags",
			header: "de;q=0, *, en_US, ja",
			expected: ["ja"],
		},
	])("$why", ({ header, expected }) => {
		expect(LanguageDetection.acceptedLanguages(header)).toEqual(expected);
	});
});

describe("LanguageDetection.match", () => {
	test.each([
		{ why: "exact match", candidates: ["es-US"], expected: "es-US" },
		{ why: "case-insensitive", candidates: ["ZH"], expected: "zh" },
		{ why: "language without region", candidates: ["ja"], expected: "ja" },
		{ why: "unsupported region", candidates: ["de-AT"], expected: "de" },
		{ why: "script subtag", candidates: ["zh-Hant-TW"], expected: "zh" },
		{ why: "Spanish of Spain", candidates: ["es-ES"], expected: "es-ES" },
		{ why: "Spanish without region", candidates: ["es"], expected: "es-ES" },
		{ why: "Mexican Spanish", candidates: ["es-MX"], expected: "es-US" },
		{
			why: "Latin American Spanish",
			candidates: ["es-419"],
			expected: "es-US",
		},
		{ why: "French of France", candidates: ["fr-FR"], expected: "fr-EU" },
		{ why: "French without region", candidates: ["fr"], expected: "fr-EU" },
		{
			why: "Canadian French without a Canadian variant",
			candidates: ["fr-CA"],
			expected: "fr-EU",
		},
		{
			why: "first matching candidate wins",
			candidates: [null, "pt-BR", "it", "ja"],
			expected: "ja",
		},
		{ why: "nothing matches", candidates: ["pt-BR", "pl"], expected: null },
		{
			why: "non-string candidates are skipped",
			candidates: [{}, 1, "de"],
			expected: "de",
		},
	])("$why", ({ candidates, expected }) => {
		expect(LanguageDetection.match(candidates, SITE_LANGUAGES)).toBe(expected);
	});

	test("Canadian French gets the Canadian variant when supported", () => {
		expect(LanguageDetection.match(["fr-CA"], GAME_LANGUAGES)).toBe("fr-CA");
	});
});
