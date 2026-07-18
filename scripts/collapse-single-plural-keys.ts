/** biome-ignore-all lint/suspicious/noConsole: script */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_PATH = path.join(__dirname, "..", "locales");
const PRIMARY_LANGUAGE = "en";

// When passed, no files are written. Instead the script exits non-zero if any
// file would be collapsed, so CI can fail a PR that committed suffixed plural
// keys in a single-plural language without running `pnpm run i18n:sync`.
const CHECK_KEY = "--check";
const checkOnly = process.argv.includes(CHECK_KEY);

// `_zero` is intentionally excluded: it is not a CLDR plural category but an
// i18next special-case override for `count === 0`. `i18next-locales-sync` treats
// e.g. `foo_zero` as a plain key (English has no `_zero` plural form), so it is
// preserved across every language and must not be collapsed into `foo`.
const COLLAPSIBLE_PLURAL_SUFFIXES = ["_one", "_two", "_few", "_many", "_other"];

// The plural form whose value we keep when collapsing. `_other` is preferred
// because it is the form i18next resolves at runtime for these languages and it
// typically carries the `{{count}}` interpolation. The remaining forms are only
// used as a fallback when `_other` has no translated value.
const PREFERRED_SUFFIX = "_other";

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

const wouldCollapse: Array<{ lang: string; file: string; keys: string[] }> = [];

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

		const { collapsed, collapsedBaseKeys } = collapsePluralKeys(content);
		if (collapsedBaseKeys.length === 0) continue;

		if (checkOnly) {
			wouldCollapse.push({ lang, file, keys: collapsedBaseKeys });
			continue;
		}

		fs.writeFileSync(filePath, `${JSON.stringify(collapsed, null, "\t")}\n`);
		console.info(`collapsed plural keys in ${lang}/${file}`);
	}
}

if (checkOnly) {
	if (wouldCollapse.length > 0) {
		console.error(
			"Found suffixed plural keys in single-plural languages that `pnpm run i18n:sync` would collapse. Run it and commit the result.",
		);
		for (const { lang, file, keys } of wouldCollapse) {
			console.error(`  ${lang}/${file}: ${keys.join(", ")}`);
		}
		process.exit(1);
	}
	console.info("no plural keys to collapse in single-plural languages");
}

function isSinglePluralLanguage(lang: string) {
	return (
		new Intl.PluralRules(lang).resolvedOptions().pluralCategories.length === 1
	);
}

function collapsePluralKeys(content: Record<string, string>) {
	const collapsed: Record<string, string> = {};
	const chosenFromPreferred = new Set<string>();
	const collapsedBaseKeys = new Set<string>();

	for (const [key, value] of Object.entries(content)) {
		const suffix = COLLAPSIBLE_PLURAL_SUFFIXES.find((sfx) => key.endsWith(sfx));
		if (!suffix) {
			collapsed[key] = value;
			continue;
		}

		const baseKey = key.slice(0, -suffix.length);
		collapsedBaseKeys.add(baseKey);
		const isPreferred = suffix === PREFERRED_SUFFIX;

		// prefer the `_other` value (it carries {{count}}); otherwise keep the
		// first non-empty value found across the remaining plural forms
		const shouldReplace =
			!(baseKey in collapsed) ||
			(!collapsed[baseKey] && !!value) ||
			(isPreferred && !!value && !chosenFromPreferred.has(baseKey));

		if (shouldReplace) {
			collapsed[baseKey] = value;
			if (isPreferred && value) {
				chosenFromPreferred.add(baseKey);
			}
		}
	}

	return { collapsed, collapsedBaseKeys: Array.from(collapsedBaseKeys) };
}
