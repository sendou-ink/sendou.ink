/** biome-ignore-all lint/suspicious/noConsole: script */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as TranslationUnits from "../app/features/translate/core/TranslationUnits.ts";
import {
	DEFAULT_LANGUAGE,
	GAME_NAMESPACES,
	gameLanguages,
	languageChain,
	languages,
} from "../app/modules/i18n/config.ts";

// Brings the translation jsons in line with English: keys English no longer has, empty translations and
// translations a regional variant shares with its parent language are removed, as are files left empty.
// Languages only used for in-game names keep only those namespaces. Untranslated keys are left out, they
// fall back to the parent language and English at runtime.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_PATH = path.join(__dirname, "..", "locales");

// writes nothing and exits non-zero if any file would change, so CI can fail a PR
// that didn't run `pnpm run i18n:sync`
const CHECK_KEY = "--check";
const checkOnly = process.argv.includes(CHECK_KEY);

type Translations = Record<string, string>;

const englishFiles = jsonFiles(DEFAULT_LANGUAGE);
const siteLanguageCodes = new Set<string>(languages.map((lang) => lang.code));
const gameNamespaces = new Set<string>(GAME_NAMESPACES);

// parents before their variants, which are compared against the already synced parent
const languagesToSync = gameLanguages
	.map((lang) => lang.code)
	.filter((code) => code !== DEFAULT_LANGUAGE)
	.sort((a, b) => languageChain(a).length - languageChain(b).length);

const unknownFolders = fs
	.readdirSync(LOCALES_PATH)
	.filter(
		(folder) =>
			!folder.startsWith(".") &&
			folder !== DEFAULT_LANGUAGE &&
			!languagesToSync.some((code) => code === folder),
	);
if (unknownFolders.length > 0) {
	console.error(
		`Unknown language folders in locales/, add them to app/modules/i18n/config.ts or delete them: ${unknownFolders.join(", ")}`,
	);
	process.exit(1);
}

const synced = new Map<string, Translations>();
const changedFiles: string[] = [];

for (const language of languagesToSync) {
	const parent = languageChain(language)[1];

	for (const file of jsonFiles(language)) {
		const filePath = path.join(LOCALES_PATH, language, file);
		const namespace = file.replace(".json", "");
		const current = JSON.parse(
			fs.readFileSync(filePath, "utf8"),
		) as Translations;

		const next = isIncluded(language, file)
			? syncedTranslations({
					language,
					namespace,
					current,
					parent:
						parent && parent !== DEFAULT_LANGUAGE
							? synced.get(`${parent}/${file}`)
							: undefined,
				})
			: {};
		synced.set(`${language}/${file}`, next);

		if (JSON.stringify(current) === JSON.stringify(next)) continue;

		changedFiles.push(`${language}/${file}`);
		if (checkOnly) continue;

		if (Object.keys(next).length === 0) {
			fs.rmSync(filePath);
		} else {
			fs.writeFileSync(filePath, `${JSON.stringify(next, null, "\t")}\n`);
		}
	}
}

if (checkOnly) {
	if (changedFiles.length > 0) {
		console.error(
			"Found translation jsons out of sync with English. Run `pnpm run i18n:sync` and commit the result.",
		);
		for (const file of changedFiles) {
			console.error(`  ${file}`);
		}
		process.exit(1);
	}
	console.info("translation jsons are in sync");
} else {
	console.info(`synced ${changedFiles.length} translation json(s)`);
}

function isIncluded(language: string, file: string) {
	if (!englishFiles.includes(file)) return false;

	return (
		siteLanguageCodes.has(language) ||
		gameNamespaces.has(file.replace(".json", ""))
	);
}

function syncedTranslations({
	language,
	namespace,
	current,
	parent,
}: {
	language: string;
	namespace: string;
	current: Translations;
	parent?: Translations;
}): Translations {
	const english = JSON.parse(
		fs.readFileSync(
			path.join(LOCALES_PATH, DEFAULT_LANGUAGE, `${namespace}.json`),
			"utf8",
		),
	) as Translations;

	const keys = TranslationUnits.fromEnglish({
		english: { [namespace]: english },
		language,
	}).flatMap((unit) => unit.forms.map((form) => form.key));

	return Object.fromEntries(
		keys.flatMap((key) => {
			const value = current[key];
			if (typeof value !== "string" || value === "") return [];
			if (parent?.[key] === value) return [];

			return [[key, value]];
		}),
	);
}

function jsonFiles(language: string) {
	return fs
		.readdirSync(path.join(LOCALES_PATH, language))
		.filter((file) => file.endsWith(".json"));
}
