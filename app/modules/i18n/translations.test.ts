import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { DEFAULT_LANGUAGE, languages } from "./config";

const LOCALES_DIR = path.join(process.cwd(), "locales");

const namespaceFiles = fs
	.readdirSync(path.join(LOCALES_DIR, DEFAULT_LANGUAGE))
	.filter((file) => file.endsWith(".json"));

const readNamespace = (language: string, file: string) => {
	const filePath = path.join(LOCALES_DIR, language, file);
	if (!fs.existsSync(filePath)) return null;

	return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<
		string,
		string
	>;
};

const interpolatedVariables = (value: string) =>
	Array.from(value.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*(?:,[^}]*)?\}\}/g))
		.map((match) => match[1])
		.sort();

describe("translations", () => {
	test.each(languages.filter(({ code }) => code !== DEFAULT_LANGUAGE))(
		"$code interpolates the same variables as English",
		({ code }) => {
			const mismatches: string[] = [];

			for (const file of namespaceFiles) {
				const english = readNamespace(DEFAULT_LANGUAGE, file)!;
				const translated = readNamespace(code, file);
				if (!translated) continue;

				for (const [key, englishValue] of Object.entries(english)) {
					const translatedValue = translated[key];
					if (!translatedValue) continue;

					const expected = interpolatedVariables(englishValue).join(",");
					const actual = interpolatedVariables(translatedValue).join(",");

					if (expected !== actual) {
						mismatches.push(
							`${file} ${key}: English has [${expected}], ${code} has [${actual}]`,
						);
					}
				}
			}

			expect(mismatches).toEqual([]);
		},
	);
});
