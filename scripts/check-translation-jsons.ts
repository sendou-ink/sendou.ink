/** biome-ignore-all lint/suspicious/noConsole: Biome v2 migration */
import fs from "node:fs";

import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NO_WRITE_KEY = "--no-write";
const dontWrite = process.argv.includes(NO_WRITE_KEY);

const KNOWN_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other"];

// `_zero` is an i18next `count === 0` override, not a CLDR plural category. It
// may legitimately sit alongside the bare singular key that single-plural
// languages (zh, ja, ko) use after `i18n:sync` collapses their plural forms, so
// unlike the real plural suffixes it never counts as a with/without-suffix clash.
const ZERO_SUFFIX = "_zero";
const PLURAL_SUFFIXES = KNOWN_SUFFIXES.filter((sfx) => sfx !== ZERO_SUFFIX);

const REPO_TRANSLATIONS_INFO_URL =
	"https://github.com/sendou-ink/sendou.ink/blob/main/docs/translation.md";

const MD = {
	inlineCode: (s: string) => `\`${s}\``,
	strong: (s: string) => `**${s}**`,
};

const otherLanguageTranslationPath = (code?: string, fileName?: string) =>
	path.join(
		...[__dirname, "..", "locales", code, fileName].filter(
			(val): val is string => !!val,
		),
	);

const allOtherLanguages = fs
	.readdirSync(otherLanguageTranslationPath())
	.filter((lang) => lang !== "en");

const missingTranslations: Record<
	string,
	Record<string, Array<string>>
> = Object.fromEntries(allOtherLanguages.map((lang) => [lang, {}]));

const totalTranslationCounts: Record<string, number> = {};

const fileNames: string[] = fs.readdirSync(otherLanguageTranslationPath("en"));

for (const file of fileNames) {
	const englishContent = JSON.parse(
		fs.readFileSync(otherLanguageTranslationPath("en", file), "utf8").trim(),
	) as Record<string, string>;
	const key = file.replace(".json", "");
	const englishContentKeys = getKeysWithoutSuffix(englishContent, "en", file);

	if (file !== "gear.json" && file !== "weapons.json") {
		totalTranslationCounts[key] = englishContentKeys.length;
	}

	for (const lang of allOtherLanguages) {
		// .DS_STORE
		if (lang.startsWith(".")) continue;

		try {
			const otherRawContent = fs
				.readFileSync(otherLanguageTranslationPath(lang, file), "utf8")
				.trim();
			let otherLanguageContent: Record<string, string>;
			try {
				otherLanguageContent = JSON.parse(otherRawContent);
			} catch {
				throw new Error(`failed to parse ${lang}/${file}`);
			}

			const otherLanguageContentKeys = getKeysWithoutSuffix(
				otherLanguageContent,
				lang,
				file,
			);

			validateVariables({
				english: englishContent,
				other: otherLanguageContent,
				lang,
				file,
			});
			validateNoDuplicateKeys({
				otherRawContent,
				file,
				lang,
			});

			const missingKeys = englishContentKeys.filter(
				(key) => !otherLanguageContentKeys.includes(key),
			);

			if (key === "weapons" || key === "gear") {
				if (missingKeys.length > 0) {
					throw new Error(`missing keys in ${lang}/${file}`);
				}
			} else {
				missingTranslations[lang][key] = missingKeys;
			}
		} catch (e) {
			if ((e as { code: string }).code !== "ENOENT") throw e;

			missingTranslations[lang][key] = englishContentKeys;
		}
	}
}

console.info("no issues found inside translation files");

if (dontWrite) {
	process.exit(0);
}

const markdown = createTranslationProgessMarkdown({
	totalTranslationCounts,
});

const translationProgressPath = path.join(
	__dirname,
	"..",
	"translation-progress.md",
);

fs.writeFileSync(translationProgressPath, markdown);

function validateVariables({
	english,
	other,
	lang,
	file,
}: {
	english: Record<string, string>;
	other: Record<string, string>;
	lang: string;
	file: string;
}) {
	for (const [key, value] of Object.entries(english)) {
		const otherValue = other[key];
		if (!otherValue) continue;

		const englishMatches = value.match(/{{(.*?)}}/g);
		const otherMatches = otherValue.match(/{{(.*?)}}/g);

		if (!englishMatches && !otherMatches) continue;

		for (const englishVar of englishMatches ?? []) {
			if (!otherMatches?.includes(englishVar)) {
				throw new Error(
					`variable mismatch in ${lang}/${file}: ${englishVar} is missing in ${otherValue}`,
				);
			}
		}
	}
}

function validateNoDuplicateKeys({
	otherRawContent,
	lang,
	file,
}: {
	otherRawContent: string;
	lang: string;
	file: string;
}) {
	const keys = new Set<string>();
	const duplicateKeys = new Set<string>();
	for (const line of otherRawContent.split("\n")) {
		const key = line.trim().split(":")[0];
		if (!key) continue;

		if (keys.has(key)) {
			duplicateKeys.add(key);
		}
		keys.add(key);
	}

	if (duplicateKeys.size > 0) {
		throw new Error(
			`duplicate key(s) in ${lang}/${file}: ${Array.from(duplicateKeys).join(
				", ",
			)}`,
		);
	}
}

// get keys while respecting different plural/context key suffixes in different languages.
function getKeysWithoutSuffix(
	translations: Record<string, string>,
	lang: string,
	file: string,
): string[] {
	const pluralBaseKeys = new Set<string>();
	const bareKeys = new Set<string>();
	const keys: string[] = [];

	const pushOnce = (key: string) => {
		if (!keys.includes(key)) keys.push(key);
	};

	for (const [key, value] of Object.entries(translations)) {
		if (value === "") {
			continue; // Consider key missing if untranslated
		}

		if (key.endsWith(ZERO_SUFFIX)) {
			// `_zero` override always maps to its base key and never clashes with it
			pushOnce(key.slice(0, -ZERO_SUFFIX.length));
			continue;
		}

		const suffix = PLURAL_SUFFIXES.find((sfx) => key.endsWith(sfx));
		if (!suffix) {
			if (pluralBaseKeys.has(key)) {
				throw new Error(
					`Found same key with and without suffixes in ${lang}/${file}: ${key}`,
				);
			}
			bareKeys.add(key);
			pushOnce(key);
			continue;
		}

		const baseKey = key.slice(0, -suffix.length);

		if (bareKeys.has(baseKey)) {
			throw new Error(
				`Found same key with and without suffixes in ${lang}/${file}: ${baseKey}`,
			);
		}

		pluralBaseKeys.add(baseKey);
		pushOnce(baseKey);
	}

	return keys;
}

type StatusProps = {
	totalCount: number;
	missingCount: number;
	percentage?: boolean;
};
function MDCompletionStatus({
	totalCount,
	missingCount,
	percentage,
}: StatusProps) {
	const circle =
		missingCount === 0 ? "🟢" : missingCount === totalCount ? "🔴" : "🟡";

	const nonMissingCount = totalCount - missingCount;

	if (!percentage) {
		return `${circle} ${nonMissingCount}/${totalCount}`;
	}

	const percent =
		totalCount === 0 ? 100 : Math.floor((nonMissingCount / totalCount) * 100);

	return `${circle} ${percent}%`;
}

function MDOverviewTable({
	totalTranslationCounts,
}: {
	totalTranslationCounts: Record<string, number>;
}) {
	const totalKeysCount = Object.values(totalTranslationCounts).reduce(
		(a, b) => a + b,
		0,
	);
	const relevantFiles = fileNames.filter(
		(name) => name !== "weapons.json" && name !== "gear.json",
	);

	const rows = [];

	rows.push(
		`| Language | Total | ${relevantFiles.map(MD.inlineCode).join(" | ")} |`,
	);

	rows.push(`| :-- | :-: | ${relevantFiles.map(() => ":-:").join(" | ")} |`);

	for (const [lang, missingKeysObj] of Object.entries(missingTranslations)) {
		const cells = [];

		cells.push(MD.strong(lang));

		const totalAmountOfMissingKeys = Object.values(missingKeysObj).reduce(
			(a, b) => a + b.length,
			0,
		);

		cells.push(
			MD.strong(
				MDCompletionStatus({
					totalCount: totalKeysCount,
					missingCount: totalAmountOfMissingKeys,
					percentage: true,
				}),
			),
		);

		for (const file of relevantFiles) {
			const fileKey = file.replace(".json", "");
			const missingKeysInFile = missingKeysObj[fileKey];
			if (!missingKeysInFile) {
				return "";
			}

			cells.push(
				MDCompletionStatus({
					totalCount: totalTranslationCounts[fileKey],
					missingCount: missingKeysInFile.length,
				}),
			);
		}

		rows.push(`| ${cells.join(" | ")} |`);
	}

	return rows.join("\n");
}

function createTranslationProgessMarkdown({
	totalTranslationCounts,
}: {
	totalTranslationCounts: Record<string, number>;
}) {
	return `
> 🤖 This issue is fully automated, it should always be up-to-date.

# Translation Progress

If you want to contribute by adding missing translations, make sure to read the [project description](${REPO_TRANSLATIONS_INFO_URL}) on how to do this 💚

## Overview

Key: 🟢 = Done, 🟡 = In progress, 🔴 = Not started

${MDOverviewTable({ totalTranslationCounts })}`;
}
