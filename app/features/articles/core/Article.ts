/**
 * An article as its page shows it: the authors it is credited to, where their names link to and
 * the body without a title line repeating the page's heading.
 */

import type * as v from "valibot";
import type { articleDataSchema } from "../articles-schemas.server";

const SENDOU_INK_ORIGIN = "https://sendou.ink";

/** An author an article is credited to, `link` leading to their sendou.ink user page or elsewhere. */
export interface ArticleAuthor {
	name: string;
	link: string | null;
}

/** The front matter's `author`: a name, a name with a link, or a list of them. */
type FrontMatterAuthor = v.InferOutput<typeof articleDataSchema>["author"];

/** The authors of an article, from the front matter's `author` in any of its forms. */
export function normalizeAuthors(
	frontMatterAuthor: FrontMatterAuthor,
): ArticleAuthor[] {
	const authors = Array.isArray(frontMatterAuthor)
		? frontMatterAuthor
		: [frontMatterAuthor];

	return authors.map((author) =>
		typeof author === "string" ? { name: author, link: null } : author,
	);
}

/**
 * Where an author's name links to, `null` for an author without a link. A sendou.ink link becomes
 * a path within the app (`isInternal`), anything else is kept as is.
 */
export function authorHref(
	author: ArticleAuthor,
): { href: string; isInternal: boolean } | null {
	if (!author.link) return null;

	if (author.link.includes(SENDOU_INK_ORIGIN)) {
		return {
			href: author.link.replace(SENDOU_INK_ORIGIN, ""),
			isInternal: true,
		};
	}

	return { href: author.link, isInternal: false };
}

/**
 * The body of an article without its first line when that is a `# ` heading of the article's
 * title, as the page shows the title above the body already. Markdown emphasis, escaped `!` and
 * `…` written as `...` don't keep the two from matching.
 */
export function bodyWithoutLeadingTitle(content: string, title: string) {
	const trimmed = content.trimStart();
	const firstLineEnd = trimmed.indexOf("\n");
	const firstLine =
		firstLineEnd === -1 ? trimmed : trimmed.slice(0, firstLineEnd);

	if (
		firstLine.startsWith("# ") &&
		normalizeText(firstLine.slice(2)) === normalizeText(title)
	) {
		return trimmed.slice(firstLine.length).trimStart();
	}

	return content;
}

function normalizeText(text: string) {
	return text
		.replace(/\*+/g, "")
		.replace(/…/g, "...")
		.replace(/\\!/g, "!")
		.trim();
}
