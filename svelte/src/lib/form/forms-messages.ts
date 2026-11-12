type FormsMessages = Record<string, string>;

const FORMS_KEY_PREFIX = "forms:";

// one lazily loaded chunk per language
const tables = import.meta.glob<FormsMessages>(
	"../../../../locales/*/forms.json",
	{ import: "default" },
);

const cache = new Map<string, Promise<FormsMessages>>();

/**
 * Texts of the `forms` namespace in the given language, English where it has no translation.
 *
 * Field labels and errors are named by key in the schemas shared with the server (`forms:labels.name`),
 * so unlike the rest of the UI they can't be static (tree-shaken) message references. Compiled messages
 * carry every language, which makes a table of them all far heavier than this one language of it.
 */
export function loadFormsMessages(locale: string): Promise<FormsMessages> {
	let messages = cache.get(locale);
	if (!messages) {
		messages = Promise.all([
			loadTable("en"),
			locale === "en" ? {} : loadTable(locale),
		]).then(([english, localized]) => ({ ...english, ...localized }));
		cache.set(locale, messages);
	}

	return messages;
}

/** Translates a `forms:` key coming from a schema or a server error; anything else is shown as is. */
export function translateFormText(
	messages: FormsMessages,
	text: string | undefined,
) {
	if (!text?.startsWith(FORMS_KEY_PREFIX)) return text;

	return messages[text.slice(FORMS_KEY_PREFIX.length)] ?? text;
}

function loadTable(locale: string): Promise<FormsMessages> {
	return (
		tables[`../../../../locales/${locale}/forms.json`]?.() ??
		Promise.resolve({})
	);
}
