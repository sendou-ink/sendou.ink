import { describe, expect, test } from "vitest";
import { mostRecentArticles } from "./list.server";

describe("mostRecentArticles", () => {
	test("parses the front matter of every article", async () => {
		const articles = await mostRecentArticles(Number.POSITIVE_INFINITY);

		expect(articles.length).toBeGreaterThan(0);
	});
});
