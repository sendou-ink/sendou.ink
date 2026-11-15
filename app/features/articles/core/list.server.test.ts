import { describe, expect, test } from "vitest";
import { articleBySlug } from "./bySlug.server";
import { mostRecentArticles } from "./list.server";

describe("mostRecentArticles", () => {
	test("parses the front matter of every article", async () => {
		const articles = await mostRecentArticles(Number.POSITIVE_INFINITY);

		expect(articles.length).toBeGreaterThan(0);
	});

	test("every article has a markdown free description", async () => {
		const articles = await mostRecentArticles(Number.POSITIVE_INFINITY);

		for (const { slug } of articles) {
			const description = articleBySlug(slug)?.description;

			expect(description, slug).toBeTruthy();
			expect(description, slug).not.toMatch(/^#|[*<>[\]\\`_~]|https?:\/\//);
			expect(description, slug).toMatch(/\p{L}/u);
			expect(description?.length, slug).toBeLessThanOrEqual(160);
		}
	});
});
