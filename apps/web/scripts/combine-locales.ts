import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const LOCALES_DIR = path.resolve(WEB_DIR, "../web-react/locales");
const OUTPUT_DIR = path.join(WEB_DIR, "messages");

const settings = JSON.parse(
	fs.readFileSync(path.join(WEB_DIR, "project.inlang/settings.json"), "utf8"),
) as { locales: string[] };

function convertVariableSyntax(text: unknown) {
	if (typeof text !== "string") return text;
	return text.replace(/\{\{([^}]+)\}\}/g, "{$1}");
}

function flattenObject(obj: Record<string, unknown>, prefix = "") {
	const flattened: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(obj)) {
		const formatKey = key.replaceAll(".", "_").replaceAll("-", "_");
		const formatPrefix = prefix
			? prefix.replaceAll(".", "_").replaceAll("-", "_")
			: prefix;
		const newKey = formatPrefix ? `${formatPrefix}_${formatKey}` : formatKey;

		if (value !== null && typeof value === "object" && !Array.isArray(value)) {
			Object.assign(
				flattened,
				flattenObject(value as Record<string, unknown>, newKey),
			);
		} else {
			flattened[newKey] = convertVariableSyntax(value);
		}
	}

	return flattened;
}

if (!fs.existsSync(OUTPUT_DIR)) {
	fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const locales = fs.readdirSync(LOCALES_DIR).filter((item) => {
	if (!fs.statSync(path.join(LOCALES_DIR, item)).isDirectory()) return false;
	return settings.locales.includes(item);
});

console.log(
	`Creating ${locales.length} language file(s) from ${LOCALES_DIR} to /messages...`,
);

for (const locale of locales) {
	const localeDir = path.join(LOCALES_DIR, locale);
	const jsonFiles = fs
		.readdirSync(localeDir)
		.filter((file) => file.endsWith(".json"));

	const combinedMessages: Record<string, unknown> = {
		$schema: "https://inlang.com/schema/inlang-message-format",
	};

	for (const file of jsonFiles) {
		const filePath = path.join(localeDir, file);
		const fileName = path.basename(file, ".json");

		const jsonContent = JSON.parse(fs.readFileSync(filePath, "utf8"));

		Object.assign(combinedMessages, flattenObject(jsonContent, fileName));
	}

	fs.writeFileSync(
		path.join(OUTPUT_DIR, `${locale}.json`),
		`${JSON.stringify(combinedMessages, null, "\t")}\n`,
		"utf8",
	);
}

console.log("Done.");
