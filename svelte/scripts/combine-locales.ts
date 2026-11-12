// Turns the i18next JSONs of ../locales (still the source of truth) into the
// inlang message format Paraglide compiles: one file per locale, keys flattened
// to `<namespace>_<key>` and `{{variable}}` rewritten to `{variable}`.
// A regional variant (es-US) gets what it lacks from the language it falls back
// to in the React app (es-ES): Paraglide's own fallback goes straight to English.
import fs from "node:fs";
import path from "node:path";
import {
	DEFAULT_LANGUAGE,
	type GameLanguageCode,
	languageChain,
} from "../../app/modules/i18n/config.ts";

const SVELTE_DIR = path.resolve(import.meta.dirname, "..");
const LOCALES_DIR = path.resolve(SVELTE_DIR, "../locales");
const OUTPUT_DIR = path.join(SVELTE_DIR, "messages");
const settings = JSON.parse(
	fs.readFileSync(path.join(SVELTE_DIR, "project.inlang/settings.json"), "utf8"),
) as { locales: string[] };

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

for (const locale of settings.locales) {
	const messages: Record<string, string> = {
		$schema: "https://inlang.com/schema/inlang-message-format",
	};

	// least specific first, so that the locale's own texts win
	const sourceLocales = languageChain(locale as GameLanguageCode)
		.filter((language) => language === locale || language !== DEFAULT_LANGUAGE)
		.toReversed();
	for (const sourceLocale of sourceLocales) {
		Object.assign(messages, localeMessages(sourceLocale));
	}

	writeIfChanged(
		path.join(OUTPUT_DIR, `${locale}.json`),
		`${JSON.stringify(messages, null, "\t")}\n`,
	);
}

function localeMessages(locale: string) {
	const localeDir = path.join(LOCALES_DIR, locale);
	const messages: Record<string, string> = {};

	for (const file of fs.readdirSync(localeDir).sort()) {
		if (!file.endsWith(".json")) continue;

		const namespace = path.basename(file, ".json");
		const content = JSON.parse(
			fs.readFileSync(path.join(localeDir, file), "utf8"),
		) as Record<string, unknown>;

		for (const [key, value] of Object.entries(content)) {
			if (typeof value !== "string") continue;

			const id = messageId(namespace, key);
			if (id in messages) {
				throw new Error(`Message id collision: ${id} (${locale}/${file})`);
			}
			messages[id] = toMessageFormat(value);
		}
	}

	return messages;
}

function messageId(namespace: string, key: string) {
	return `${namespace}_${key}`.replaceAll(/[^a-zA-Z0-9_]/g, "_");
}

function toMessageFormat(text: string) {
	return text
		.replaceAll(/\{\{\s*([^}\s,]+)[^}]*\}\}/g, "\u0000$1\u0001")
		.replaceAll("{", "\\{")
		.replaceAll("}", "\\}")
		.replaceAll("\u0000", "{")
		.replaceAll("\u0001", "}");
}

// unchanged files keep their mtime so the dev server doesn't recompile
function writeIfChanged(filePath: string, content: string) {
	if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") === content) {
		return;
	}
	fs.writeFileSync(filePath, content, "utf8");
}
