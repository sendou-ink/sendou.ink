/** biome-ignore-all lint/suspicious/noConsole: script */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_PATH = path.join(__dirname, "..", "locales");
const PRIMARY_LANGUAGE = "en";

// `_zero` is intentionally excluded: it is not a CLDR plural category but an
// i18next special-case override for `count === 0`. `i18next-locales-sync` treats
// e.g. `foo_zero` as a plain key (English has no `_zero` plural form), so it is
// preserved across every language and must not be collapsed into `foo`.
const COLLAPSIBLE_PLURAL_SUFFIXES = ["_one", "_two", "_few", "_many", "_other"];

// `i18next-locales-sync` stores plural keys for languages whose CLDR cardinal
// rule has a single category ("other" only, e.g. zh, ja, ko) under the bare
// singular key instead of suffixed `_one`/`_other` keys. When a translator adds
// a value under a suffixed key for one of these languages, the sync tool can't
// find the singular key it expects and silently drops the translation. We run
// this before the sync to collapse those suffixed keys into the singular key,
// preserving the (non-empty) value so it survives the sync.
const languages = fs
	.readdirSync(LOCALES_PATH)
	.filter((lang) => lang !== PRIMARY_LANGUAGE && !lang.startsWith("."));

for (const lang of languages) {
	if (!isSinglePluralLanguage(lang)) continue;

	const langPath = path.join(LOCALES_PATH, lang);
	const files = fs
		.readdirSync(langPath)
		.filter((file) => file.endsWith(".json"));

	for (const file of files) {
		const filePath = path.join(langPath, file);
		const content = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<
			string,
			string
		>;

		const { collapsed, changed } = collapsePluralKeys(content);
		if (!changed) continue;

		fs.writeFileSync(filePath, `${JSON.stringify(collapsed, null, "\t")}\n`);
		console.info(`collapsed plural keys in ${lang}/${file}`);
	}
}

function isSinglePluralLanguage(lang: string) {
	return (
		new Intl.PluralRules(lang).resolvedOptions().pluralCategories.length === 1
	);
}

function collapsePluralKeys(content: Record<string, string>) {
	const collapsed: Record<string, string> = {};
	let changed = false;

	for (const [key, value] of Object.entries(content)) {
		const suffix = COLLAPSIBLE_PLURAL_SUFFIXES.find((sfx) => key.endsWith(sfx));
		if (!suffix) {
			collapsed[key] = value;
			continue;
		}

		changed = true;
		const baseKey = key.slice(0, -suffix.length);

		// keep the first non-empty value found across the plural forms
		if (!(baseKey in collapsed) || (!collapsed[baseKey] && value)) {
			collapsed[baseKey] = value;
		}
	}

	return { collapsed, changed };
}
