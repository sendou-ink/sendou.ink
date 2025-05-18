import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { ARTICLES_FOLDER_PATH } from "../articles-constants";
import { articleDataSchema } from "../articles-schemas.server";
import { type articleBySlug, normalizeAuthors } from "./bySlug.server";

export async function mostRecentArticles(count: number) {
	const files = await fs.promises.readdir(ARTICLES_FOLDER_PATH);

	const articles: Array<
		Omit<NonNullable<ReturnType<typeof articleBySlug>>, "content"> & {
			slug: string;
			dateString: string;
		}
	> = [];
	for (const file of files) {
		const rawMarkdown = fs.readFileSync(
			path.join(ARTICLES_FOLDER_PATH, file),
			"utf8",
		);
		const { data } = matter(rawMarkdown);

		const { date, ...restParsed } = articleDataSchema.parse(data);
		articles.push({
			date,
			slug: file.replace(".md", ""),
			dateString: date.toLocaleDateString("en-US", {
				day: "2-digit",
				month: "long",
				year: "numeric",
			}),
			authors: normalizeAuthors(restParsed.author),
			title: restParsed.title,
		});
	}

	return articles
		.sort((a, b) => b.date.getTime() - a.date.getTime())
		.slice(0, count)
		.map(({ date: _date, ...rest }) => rest);
}
