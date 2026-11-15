import { truncateBySentence } from "~/utils/strings";

const LEADING_LINES_SEARCHED_FOR_TITLE = 3;

const HEADING_REGEX = /^#{1,6}\s+(.*)$/;

/** Search engines cut a description at around this many characters. */
const DESCRIPTION_MAX_LENGTH = 160;

const SOURCE_NOTICE_REGEX = /^(this )?article (was )?(originally|ported)\b/i;
const ITALIC_REGEX = /^(\*|_)(?!\1).*[^*_]\1$/;
const ABBREVIATION_END_REGEX = /\b(vs|etc|e\.g|i\.e|approx|ca)\.$/i;

/**
 * The body of an article without a heading of its title, as the page shows the title above the body
 * already. The heading is looked for among the first few non-empty lines, so lines before it (a
 * source notice of an article ported from elsewhere, a banner image) are kept. Only the first
 * heading counts and it can be of any level. Letter case, markdown emphasis and escapes, `…`
 * written as `...` and curly quotes don't keep the two from matching.
 */
export function bodyWithoutLeadingTitle(content: string, title: string) {
	const lines = content.split("\n");

	let nonEmptyLinesSeen = 0;
	for (const [index, line] of lines.entries()) {
		if (!line.trim()) continue;
		if (nonEmptyLinesSeen === LEADING_LINES_SEARCHED_FOR_TITLE) break;
		nonEmptyLinesSeen++;

		const heading = line.trim().match(HEADING_REGEX);
		if (!heading) continue;

		if (normalizeText(heading[1]) !== normalizeText(title)) return content;

		const before = lines.slice(0, index).join("\n").trim();
		const after = lines
			.slice(index + 1)
			.join("\n")
			.trimStart();

		return before ? `${before}\n\n${after}` : after;
	}

	return content;
}

/**
 * The description of an article for link previews and search results: the plain text of the
 * body's first line of actual text, cut to fit {@link DESCRIPTION_MAX_LENGTH} characters. Skips
 * the source notice of ported articles ("Article originally posted at: …"), lines of only HTML or
 * images (a banner `<img>`), a line repeating the title and headings (the title, section names)
 * other than an italic subtitle (`#### *…*`). Returns `null` when the body has no such line.
 */
export function description(content: string, title: string): string | null {
	for (const line of content.split("\n")) {
		if (isNonSubtitleHeading(line)) continue;

		const text = plainText(line);

		if (!text) continue;
		if (SOURCE_NOTICE_REGEX.test(text)) continue;
		if (normalizeText(text) === normalizeText(title)) continue;

		return truncate(text);
	}

	return null;
}

function isNonSubtitleHeading(markdownLine: string) {
	const headingText = markdownLine.trim().match(HEADING_REGEX)?.[1];
	if (headingText === undefined) return false;

	return !ITALIC_REGEX.test(headingText.trim());
}

function plainText(markdownLine: string) {
	return markdownLine
		.trim()
		.replace(/^(#{1,6}|>|[-*+]|\d+\.)\s+/, "")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/^\[(.*)\]$/, "$1")
		.replace(/<!--.*?-->/g, "")
		.replace(/<\/?[a-zA-Z][^>]*>/g, "")
		.replace(/(\*+|_{2,}|~~|`)/g, "")
		.replace(/(^|[^\p{L}\p{N}])_(\S(?:.*?\S)?)_(?![\p{L}\p{N}])/gu, "$1$2")
		.replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, "$1")
		.replace(/^[-*_=\s|:]+$/, "")
		.replace(/\s+/g, " ")
		.trim();
}

function truncate(text: string) {
	if (text.length <= DESCRIPTION_MAX_LENGTH) return text;

	const bySentence = truncateBySentence(text, DESCRIPTION_MAX_LENGTH - 1);
	if (/[.!?]$/.test(bySentence) && !ABBREVIATION_END_REGEX.test(bySentence)) {
		return bySentence;
	}

	const cut = text.slice(0, DESCRIPTION_MAX_LENGTH);
	const wholeWords = cut.slice(0, cut.lastIndexOf(" "));

	return `${wholeWords.replace(/[\s,;:—–-]+$/, "")}…`;
}

function normalizeText(text: string) {
	return text
		.replace(/\*+/g, "")
		.replace(/\\(.)/g, "$1")
		.replace(/…/g, "...")
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}
