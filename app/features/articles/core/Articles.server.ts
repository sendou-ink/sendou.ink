/**
 * Articles are the markdown files of `content/articles`: the file name is the article's slug and
 * the front matter gives its title, date and authors. The list of articles is read once and kept
 * in memory, an article's body on every request to it. A development build reads everything again
 * on every call, so new and edited files show without a restart.
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import * as v from "valibot";
import { IS_DEV_BUILD } from "~/utils/dev-build";
import { ARTICLES_FOLDER_PATH } from "../articles-constants";
import { articleDataSchema } from "../articles-schemas.server";
import * as Article from "./Article";

const RESOLVED_ARTICLES_DIR = path.resolve(ARTICLES_FOLDER_PATH);

/** An article as listed, without its body. `date` is a timestamp of midnight UTC of its date. */
interface ArticleListing {
	slug: string;
	title: string;
	date: number;
	authors: Article.ArticleAuthor[];
}

let fileNames: Set<string> | null = null;
let listingsByDateDesc: Promise<ArticleListing[]> | null = null;

/**
 * The article of the slug with its markdown body, `null` when there is no such article or its
 * front matter is invalid. Only slugs of the files in the articles folder are read, so a slug
 * can't lead outside of it.
 */
export function findBySlug(
	slug: string,
): (Omit<ArticleListing, "slug"> & { content: string }) | null {
	if (!fileNames || IS_DEV_BUILD) {
		fileNames = new Set(fs.globSync("*.md", { cwd: RESOLVED_ARTICLES_DIR }));
	}
	if (!fileNames.has(`${slug}.md`)) return null;

	try {
		const { content, data } = matter(
			fs.readFileSync(path.join(RESOLVED_ARTICLES_DIR, `${slug}.md`), "utf8"),
		);

		return { ...parseFrontMatter(data), content };
	} catch (e) {
		if (!(e instanceof Error)) throw e;

		if (e.message.includes("ENOENT") || e instanceof v.ValiError) {
			return null;
		}

		throw e;
	}
}

/** The `count` newest articles, newest first. Throws if any article's front matter is invalid. */
export async function mostRecent(count: number) {
	if (!listingsByDateDesc || IS_DEV_BUILD) {
		listingsByDateDesc = readListingsByDateDesc();
	}

	return (await listingsByDateDesc).slice(0, count);
}

async function readListingsByDateDesc() {
	const files = await fs.promises.readdir(ARTICLES_FOLDER_PATH);

	const listings: ArticleListing[] = [];
	for (const file of files) {
		const { data } = matter(
			fs.readFileSync(path.join(ARTICLES_FOLDER_PATH, file), "utf8"),
		);

		listings.push({
			slug: file.replace(".md", ""),
			...parseFrontMatter(data),
		});
	}

	return listings.sort((a, b) => b.date - a.date);
}

function parseFrontMatter(data: unknown) {
	const { title, date, author } = v.parse(articleDataSchema, data);

	return {
		title,
		date: date.getTime(),
		authors: Article.normalizeAuthors(author),
	};
}
