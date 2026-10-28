import type { LoaderFunctionArgs } from "react-router";
import { ServerConfig } from "~/config.server";
import { invariant } from "~/utils/invariant";
import * as MarkdownHtml from "~/utils/markdown-html.server";
import { notFoundIfNullish } from "~/utils/remix.server";
import { articleBySlug } from "../core/bySlug.server";

/** Articles only change with a deploy so in production each is rendered once per server lifetime */
const renderedArticles = new Map<string, ReturnType<typeof renderArticle>>();

export const loader = ({ params }: LoaderFunctionArgs) => {
	invariant(params.slug);

	const cached = renderedArticles.get(params.slug);
	if (cached) return cached;

	const article = renderArticle(params.slug);
	if (article && ServerConfig.isProduction) {
		renderedArticles.set(params.slug, article);
	}

	return notFoundIfNullish(article);
};

function renderArticle(slug: string) {
	const article = articleBySlug(slug);
	if (!article) return null;

	const { content, ...rest } = article;

	return {
		...rest,
		slug,
		description: content.trim().split("\n")[0],
		html: MarkdownHtml.render(contentWithoutLeadingTitle(content, rest.title)),
	};
}

function normalizeText(text: string) {
	return text
		.replace(/\*+/g, "")
		.replace(/…/g, "...")
		.replace(/\\!/g, "!")
		.trim();
}

function contentWithoutLeadingTitle(content: string, title: string) {
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
