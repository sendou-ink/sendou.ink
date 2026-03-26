import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { ZodError, type z } from "zod";
import { ARTICLES_FOLDER_PATH } from "../articles-constants";
import { articleDataSchema } from "../articles-schemas.server";

export function articleBySlug(slug: string) {
	try {
		const rawMarkdown = fs.readFileSync(
			path.join(ARTICLES_FOLDER_PATH, `${slug}.md`),
			"utf8",
		);
		const { content, data } = matter(rawMarkdown);

		const { date, ...restParsed } = articleDataSchema.parse(data);

		return {
			content,
			date,
			dateString: date.toLocaleDateString("en-US", {
				day: "2-digit",
				month: "long",
				year: "numeric",
			}),
			authors: normalizeAuthors(restParsed.author),
			title: restParsed.title,
		};
	} catch (e) {
		if (!(e instanceof Error)) throw e;

		if (e.message.includes("ENOENT") || e instanceof ZodError) {
			return null;
		}

		throw e;
	}
}

export function normalizeAuthors(
	authors: z.infer<typeof articleDataSchema>["author"],
): Array<{ name: string; link: string | null }> {
	if (Array.isArray(authors)) {
		return authors.map((author) => {
			if (typeof author === "string") {
				return { name: author, link: null };
			}
			return author;
		});
	}

	if (typeof authors === "string") {
		return [{ name: authors, link: null }];
	}
	return [authors];
}
