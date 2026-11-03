import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import * as v from "valibot";
import { IS_DEV_BUILD } from "~/utils/dev-build";
import { ARTICLES_FOLDER_PATH } from "../articles-constants";
import { articleDataSchema } from "../articles-schemas.server";
import { type articleBySlug, normalizeAuthors } from "./bySlug.server";

type ListedArticle = Omit<
	NonNullable<ReturnType<typeof articleBySlug>>,
	"content"
> & {
	slug: string;
};

let articlesByDateDesc: Promise<ListedArticle[]> | null = null;

export async function mostRecentArticles(count: number) {
	if (!articlesByDateDesc || IS_DEV_BUILD) {
		articlesByDateDesc = readArticlesByDateDesc();
	}

	return (await articlesByDateDesc).slice(0, count);
}

async function readArticlesByDateDesc() {
	const files = await fs.promises.readdir(ARTICLES_FOLDER_PATH);

	const articles: ListedArticle[] = [];
	for (const file of files) {
		const rawMarkdown = fs.readFileSync(
			path.join(ARTICLES_FOLDER_PATH, file),
			"utf8",
		);
		const { data } = matter(rawMarkdown);

		const { date, ...restParsed } = v.parse(articleDataSchema, data);
		articles.push({
			date: date.getTime(),
			slug: file.replace(".md", ""),
			authors: normalizeAuthors(restParsed.author),
			title: restParsed.title,
		});
	}

	return articles.sort((a, b) => b.date - a.date);
}
