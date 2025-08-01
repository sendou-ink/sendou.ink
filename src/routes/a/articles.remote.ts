import { prerender } from '$app/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { z, ZodError } from 'zod/v4';
import invariant from '$lib/utils/invariant';

const ARTICLES_FOLDER_PATH = 'content/articles';

const authorSchema = z.union([z.string(), z.object({ name: z.string(), link: z.string().url() })]);

const articleDataSchema = z.object({
	title: z.string().min(1),
	author: z.union([authorSchema, z.array(authorSchema)]),
	date: z.date()
});

export const allArticles = prerender(async () => {
	return allArticlesFromFs();
});

async function allArticlesFromFs() {
	const files = await fs.readdir(ARTICLES_FOLDER_PATH);

	const articles: Array<
		Omit<NonNullable<Awaited<ReturnType<typeof articleFromFs>>>, 'content'> & {
			slug: string;
			dateString: string;
		}
	> = [];
	for (const file of files) {
		const rawMarkdown = await fs.readFile(path.join(ARTICLES_FOLDER_PATH, file), 'utf8');
		const { data } = matter(rawMarkdown);

		const { date, ...restParsed } = articleDataSchema.parse(data);
		articles.push({
			date,
			slug: file.replace('.md', ''),
			dateString: date.toLocaleDateString('en-US', {
				day: '2-digit',
				month: 'long',
				year: 'numeric'
			}),
			authors: normalizeAuthors(restParsed.author),
			title: restParsed.title
		});
	}

	return articles
		.sort((a, b) => b.date.getTime() - a.date.getTime())
		.map(({ date: _date, ...rest }) => rest);
}

export type ArticleBySlugData = Awaited<ReturnType<typeof articleBySlug>>;

export const articleBySlug = prerender(
	z.string(),
	async (slug) => {
		const article = await articleFromFs(slug);

		invariant(article, `Article with slug "${slug}" not found`);

		return article;
	},
	{
		// TODO: this can be dropped when async SSR is released and Svelte crawls the pages
		inputs: () => allArticlesFromFs().then((articles) => articles.map((article) => article.slug))
	}
);

async function articleFromFs(slug: string) {
	try {
		const rawMarkdown = await fs.readFile(path.join(ARTICLES_FOLDER_PATH, `${slug}.md`), 'utf8');
		const { content, data } = matter(rawMarkdown);

		const { date, ...restParsed } = articleDataSchema.parse(data);

		return {
			content,
			date,
			dateString: date.toLocaleDateString('en-US', {
				day: '2-digit',
				month: 'long',
				year: 'numeric'
			}),
			authors: normalizeAuthors(restParsed.author),
			title: restParsed.title
		};
	} catch (e) {
		if (!(e instanceof Error)) throw e;

		if (e.message.includes('ENOENT') || e instanceof ZodError) {
			return null;
		}

		throw e;
	}
}

function normalizeAuthors(
	authors: z.infer<typeof articleDataSchema>['author']
): Array<{ name: string; link: string | null }> {
	if (Array.isArray(authors)) {
		return authors.map((author) => {
			if (typeof author === 'string') {
				return { name: author, link: null };
			}
			return author;
		});
	}

	if (typeof authors === 'string') {
		return [{ name: authors, link: null }];
	}
	return [authors];
}
