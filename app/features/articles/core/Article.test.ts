import { describe, expect, test } from "vitest";
import * as Article from "./Article";

describe("Article.normalizeAuthors", () => {
	test.each([
		{
			why: "a name",
			author: "YELLOW",
			expected: [{ name: "YELLOW", link: null }],
		},
		{
			why: "a name with a link",
			author: { name: "YELLOW", link: "https://sendou.ink/u/yellow" },
			expected: [{ name: "YELLOW", link: "https://sendou.ink/u/yellow" }],
		},
		{
			why: "a list mixing both",
			author: ["Samino", { name: "Radha", link: "https://sendou.ink/u/wiper" }],
			expected: [
				{ name: "Samino", link: null },
				{ name: "Radha", link: "https://sendou.ink/u/wiper" },
			],
		},
	])("reads $why", ({ author, expected }) => {
		expect(Article.normalizeAuthors(author)).toEqual(expected);
	});
});

describe("Article.authorHref", () => {
	test.each([
		{
			why: "a sendou.ink link becomes an in-app path",
			link: "https://sendou.ink/u/samino",
			expected: { href: "/u/samino", isInternal: true },
		},
		{
			why: "any other link is kept as is",
			link: "https://bsky.app/profile/yellow",
			expected: { href: "https://bsky.app/profile/yellow", isInternal: false },
		},
		{ why: "an author without a link has none", link: null, expected: null },
	])("$why", ({ link, expected }) => {
		expect(Article.authorHref({ name: "Samino", link })).toEqual(expected);
	});
});

describe("Article.bodyWithoutLeadingTitle", () => {
	test.each([
		{
			why: "the title heading",
			content: "# Results from Riptide\n\nBody",
			title: "Results from Riptide",
		},
		{
			why: "the title heading after blank lines",
			content: "\n\n# Results from Riptide\nBody",
			title: "Results from Riptide",
		},
		{
			why: "an emphasized title heading",
			content: "# **Results from Riptide**\n\nBody",
			title: "Results from Riptide",
		},
		{
			why: "a title heading with an escaped !",
			content: "# Wave goodbye\\!\n\nBody",
			title: "Wave goodbye!",
		},
		{
			why: "a title heading with an ellipsis",
			content: "# And then…\n\nBody",
			title: "And then...",
		},
	])("drops $why", ({ content, title }) => {
		expect(Article.bodyWithoutLeadingTitle(content, title)).toBe("Body");
	});

	test.each([
		{ why: "a heading of other text", content: "# Day one\n\nBody" },
		{ why: "a lower level title heading", content: "## Riptide\n\nBody" },
		{ why: "the title as plain text", content: "Riptide\n\nBody" },
	])("keeps $why", ({ content }) => {
		expect(Article.bodyWithoutLeadingTitle(content, "Riptide")).toBe(content);
	});

	test("drops a body that is only the title heading", () => {
		expect(Article.bodyWithoutLeadingTitle("# Riptide", "Riptide")).toBe("");
	});
});
