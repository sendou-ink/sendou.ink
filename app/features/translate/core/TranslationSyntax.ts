const VARIABLE_REGEX = /\{\{\s*([^{}]+?)\s*\}\}/g;
const NESTING_REGEX = /\$t\([^)]*\)/g;
const TAG_REGEX = /<(\/?)([a-zA-Z0-9]+)\s*(\/?)>/g;
const HTML_MARKUP_REGEX = /<[a-zA-Z/!?]/;
const PLACEHOLDER_REGEX = new RegExp(
	[VARIABLE_REGEX.source, NESTING_REGEX.source, TAG_REGEX.source].join("|"),
	"g",
);

const PLURAL_COUNT_VARIABLE = "{{count}}";

export type SyntaxIssue =
	| { type: "EMPTY" }
	| { type: "MISSING_PLACEHOLDER"; placeholder: string }
	| { type: "UNKNOWN_PLACEHOLDER"; placeholder: string }
	| { type: "BROKEN_TAGS" }
	| { type: "TAG_MUST_BE_EMPTY"; placeholder: string }
	| { type: "UNSUPPORTED_MARKUP" };

export type TextSegment = {
	text: string;
	isPlaceholder: boolean;
};

/**
 * Validates that a translation keeps the special syntax of its English source: every `{{variable}}`,
 * `$t(nesting)` and `<tag>` of the source and nothing else. Tags may wrap different words but must stay
 * balanced, and a tag the source leaves empty (`<0></0>`) must stay empty. Any other HTML-like markup
 * (attributes, comments) is rejected. In plural forms `{{count}}` is optional since many languages spell
 * out e.g. the singular form.
 *
 * @example
 * TranslationSyntax.validate({ source: "by {{author}}", translation: "von {{author}}" }); // []
 * TranslationSyntax.validate({ source: "by {{author}}", translation: "von" });
 * // [{ type: "MISSING_PLACEHOLDER", placeholder: "{{author}}" }]
 */
export function validate({
	source,
	translation,
	isPlural = false,
}: {
	source: string;
	translation: string;
	isPlural?: boolean;
}): SyntaxIssue[] {
	if (translation.trim() === "") return [{ type: "EMPTY" }];

	const issues: SyntaxIssue[] = [];

	if (HTML_MARKUP_REGEX.test(translation.replace(TAG_REGEX, " "))) {
		issues.push({ type: "UNSUPPORTED_MARKUP" });
	}

	const ignored = isPlural ? [PLURAL_COUNT_VARIABLE] : [];
	const sourceTokens = inlineTokens(source).filter((t) => !ignored.includes(t));
	const translationTokens = inlineTokens(translation).filter(
		(t) => !ignored.includes(t),
	);

	for (const token of new Set(sourceTokens)) {
		if (!translationTokens.includes(token)) {
			issues.push({ type: "MISSING_PLACEHOLDER", placeholder: token });
		}
	}
	for (const token of new Set(translationTokens)) {
		if (!sourceTokens.includes(token)) {
			issues.push({ type: "UNKNOWN_PLACEHOLDER", placeholder: token });
		}
	}

	const sourceTags = parseTags(source);
	const translationTags = parseTags(translation);

	if (!sourceTags || !translationTags) {
		issues.push({ type: "BROKEN_TAGS" });
		return issues;
	}

	const sourceTagCounts = countBy(sourceTags.map(tagPlaceholder));
	const translationTagCounts = countBy(translationTags.map(tagPlaceholder));

	for (const [placeholder, count] of sourceTagCounts) {
		if ((translationTagCounts.get(placeholder) ?? 0) < count) {
			issues.push({ type: "MISSING_PLACEHOLDER", placeholder });
		}
	}
	for (const [placeholder, count] of translationTagCounts) {
		if ((sourceTagCounts.get(placeholder) ?? 0) < count) {
			issues.push({ type: "UNKNOWN_PLACEHOLDER", placeholder });
		}
	}

	const emptySourceTags = new Set(
		sourceTags.filter((tag) => tag.isEmpty).map(tagPlaceholder),
	);
	for (const tag of translationTags) {
		const placeholder = tagPlaceholder(tag);
		if (!tag.isEmpty && emptySourceTags.has(placeholder)) {
			issues.push({ type: "TAG_MUST_BE_EMPTY", placeholder });
		}
	}

	return issues;
}

/**
 * Placeholders of the text a translation has to keep, in order of first appearance. Paired tags are given as
 * one placeholder with nothing between them (`<1></1>`) so it can be inserted as is.
 *
 * @example
 * TranslationSyntax.placeholders("See <1>FAQ</1> for {{what}}"); // ["<1></1>", "{{what}}"]
 */
export function placeholders(source: string): string[] {
	const result: string[] = [];

	for (const match of source.matchAll(PLACEHOLDER_REGEX)) {
		const placeholder = normalizePlaceholder(match[0]);
		if (placeholder && !result.includes(placeholder)) result.push(placeholder);
	}

	return result;
}

/**
 * Splits the text into plain text and placeholder segments, for highlighting the parts a translator
 * must keep as they are.
 */
export function segments(text: string): TextSegment[] {
	const result: TextSegment[] = [];
	let lastIndex = 0;

	for (const match of text.matchAll(PLACEHOLDER_REGEX)) {
		if (match.index > lastIndex) {
			result.push({
				text: text.slice(lastIndex, match.index),
				isPlaceholder: false,
			});
		}
		result.push({ text: match[0], isPlaceholder: true });
		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < text.length) {
		result.push({ text: text.slice(lastIndex), isPlaceholder: false });
	}

	return result;
}

type ParsedTag = {
	name: string;
	isSelfClosing: boolean;
	isEmpty: boolean;
};

function inlineTokens(text: string) {
	return [
		...Array.from(text.matchAll(VARIABLE_REGEX), (match) => `{{${match[1]}}}`),
		...Array.from(text.matchAll(NESTING_REGEX), (match) => match[0]),
	];
}

/** Tags of the text, `null` if they are not balanced */
function parseTags(text: string): ParsedTag[] | null {
	const result: ParsedTag[] = [];
	const openTags: Array<{ name: string; contentStart: number }> = [];

	for (const match of text.matchAll(TAG_REGEX)) {
		const [whole, closingSlash, name, selfClosingSlash] = match;

		if (selfClosingSlash) {
			if (closingSlash) return null;
			result.push({ name, isSelfClosing: true, isEmpty: true });
			continue;
		}

		if (!closingSlash) {
			openTags.push({ name, contentStart: match.index + whole.length });
			continue;
		}

		const openTag = openTags.pop();
		if (!openTag || openTag.name !== name) return null;

		result.push({
			name,
			isSelfClosing: false,
			isEmpty: text.slice(openTag.contentStart, match.index) === "",
		});
	}

	if (openTags.length > 0) return null;

	return result;
}

function tagPlaceholder(tag: ParsedTag) {
	return tag.isSelfClosing ? `<${tag.name}/>` : `<${tag.name}></${tag.name}>`;
}

function normalizePlaceholder(raw: string) {
	const variable = /^\{\{\s*([^{}]+?)\s*\}\}$/.exec(raw);
	if (variable) return `{{${variable[1]}}}`;

	const tag = /^<(\/?)([a-zA-Z0-9]+)\s*(\/?)>$/.exec(raw);
	if (tag) {
		const [, closingSlash, name, selfClosingSlash] = tag;
		if (closingSlash) return null;
		return selfClosingSlash ? `<${name}/>` : `<${name}></${name}>`;
	}

	return raw;
}

function countBy(values: string[]) {
	const result = new Map<string, number>();
	for (const value of values) {
		result.set(value, (result.get(value) ?? 0) + 1);
	}
	return result;
}
