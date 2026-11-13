import { describe, expect, test } from "vitest";
import * as Articles from "./Articles.server";

const RIPTIDE_SLUG = "results-from-riptide-2025";

describe("Articles.findBySlug", () => {
	test("reads the article's front matter and body", () => {
		const article = Articles.findBySlug(RIPTIDE_SLUG);

		expect(article).toMatchObject({
			title: "Results from Riptide 2025",
			date: Date.UTC(2025, 8, 13),
			authors: [
				{ name: "YELLOW", link: "https://sendou.ink/u/great-hero-yellow" },
			],
		});
		expect(article?.content).toContain("Riptide");
	});

	test("returns null for an unknown slug", () => {
		expect(Articles.findBySlug("no-such-article")).toBeNull();
	});

	test("returns null for a slug leading outside the articles folder", () => {
		expect(Articles.findBySlug("../../README")).toBeNull();
	});
});

describe("Articles.mostRecent", () => {
	test("parses the front matter of every article", async () => {
		const articles = await Articles.mostRecent(Number.POSITIVE_INFINITY);

		expect(articles.length).toBeGreaterThan(0);
	});

	test("lists the newest first", async () => {
		const articles = await Articles.mostRecent(Number.POSITIVE_INFINITY);

		const dates = articles.map((article) => article.date);
		expect(dates).toEqual([...dates].sort((a, b) => b - a));
	});

	test("lists at most the count", async () => {
		const articles = await Articles.mostRecent(2);

		expect(articles).toHaveLength(2);
	});

	test("lists an article by its file name as slug, without its body", async () => {
		const articles = await Articles.mostRecent(Number.POSITIVE_INFINITY);

		const riptide = articles.find((article) => article.slug === RIPTIDE_SLUG);
		expect(riptide?.title).toBe("Results from Riptide 2025");
		expect(riptide).not.toHaveProperty("content");
	});
});
