const LEADING_LINES_SEARCHED_FOR_TITLE = 3;

const HEADING_REGEX = /^#{1,6}\s+(.*)$/;

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
