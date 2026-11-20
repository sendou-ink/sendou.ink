import { describe, expect, test } from "vitest";
import * as Article from "./Article";

const SOURCE_NOTICE =
	"Article originally posted at: [https://www.splatoonstronghold.com/news/results-from-riptide-2025](https://www.splatoonstronghold.com/news/results-from-riptide-2025)";
const BANNER =
	'<img width="1200" height="675" alt="banner" src="banner.png" />';
const TITLE = "Results from Riptide 2025";
const PARAGRAPH =
	"Riptide 2025 took place between Friday, September 5 and Sunday, September 7.";

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
			why: "a title heading with escaped punctuation",
			content: "# **Event \\#3 (Week 1\\)**\n\nBody",
			title: "Event #3 (Week 1)",
		},
		{
			why: "a title heading with an ellipsis",
			content: "# And then…\n\nBody",
			title: "And then...",
		},
		{
			why: "a title heading with a curly apostrophe",
			content: "# **SuperJump 7: 2025’s Hypest Grand Finals**\n\nBody",
			title: "SuperJump 7: 2025's Hypest Grand Finals",
		},
		{
			why: "a lower level title heading",
			content: "## **IPL x AREA CUP: Splat World Series**\n\nBody",
			title: "IPL x AREA CUP: Splat World Series",
		},
		{
			why: "a title heading in a different case",
			content: "# **onward: The Journey Beyond**\n\nBody",
			title: "Onward: the journey beyond",
		},
	])("drops $why", ({ content, title }) => {
		expect(Article.bodyWithoutLeadingTitle(content, title)).toBe("Body");
	});

	test.each([
		{
			why: "a source notice",
			content: `${SOURCE_NOTICE}\n\n# **Results from Riptide**\n\nBody`,
			expected: `${SOURCE_NOTICE}\n\nBody`,
		},
		{
			why: "a banner and a source notice",
			content: `${BANNER}\n\n${SOURCE_NOTICE}\n\n# **Results from Riptide**\n\nBody`,
			expected: `${BANNER}\n\n${SOURCE_NOTICE}\n\nBody`,
		},
	])(
		"drops the title heading after $why, keeping it",
		({ content, expected }) => {
			expect(
				Article.bodyWithoutLeadingTitle(content, "Results from Riptide"),
			).toBe(expected);
		},
	);

	test.each([
		{ why: "a heading of other text", content: "# Day one\n\nBody" },
		{ why: "the title as plain text", content: "Riptide\n\nBody" },
		{
			why: "a title heading after a heading of other text",
			content: "#### *A subtitle*\n\n# Riptide\n\nBody",
		},
		{
			why: "a title heading after the first few lines",
			content: "One\n\nTwo\n\nThree\n\n# Riptide\n\nBody",
		},
	])("keeps $why", ({ content }) => {
		expect(Article.bodyWithoutLeadingTitle(content, "Riptide")).toBe(content);
	});

	test("drops a body that is only the title heading", () => {
		expect(Article.bodyWithoutLeadingTitle("# Riptide", "Riptide")).toBe("");
	});
});

describe("Article.description", () => {
	test.each([
		{ why: "a plain paragraph", content: PARAGRAPH, expected: PARAGRAPH },
		{
			why: "a source notice linking its url",
			content: `Article originally posted at: [https://www.splatoonstronghold.com/news/results-from-riptide-2025](https://www.splatoonstronghold.com/news/results-from-riptide-2025)\n\n${PARAGRAPH}`,
			expected: PARAGRAPH,
		},
		{
			why: "a source notice naming the website",
			content: `Article ported from the [Splatoon Stronghold](https://www.splatoonstronghold.com/news/a-dying-scene-stronghold-and-splatoon-4) website\n\n${PARAGRAPH}`,
			expected: PARAGRAPH,
		},
		{
			why: "a bracketed note the article was originally made elsewhere",
			content: `[This article was originally made for Nintendo. With their permission rereleasing it this time on sendou.ink.]\n\n${PARAGRAPH}`,
			expected: PARAGRAPH,
		},
		{
			why: "a banner image",
			content: `<img width="1200" height="675" alt="ARTICLE_BANNER" src="https://github.com/user-attachments/assets/3cc38497" />\n\n${PARAGRAPH}`,
			expected: PARAGRAPH,
		},
		{
			why: "a markdown image",
			content: `![Banner](https://example.com/banner.png)\n\n${PARAGRAPH}`,
			expected: PARAGRAPH,
		},
		{
			why: "a heading of the title",
			content: `# **Results from Riptide 2025**\n\n${PARAGRAPH}`,
			expected: PARAGRAPH,
		},
		{
			why: "a title heading after a source notice",
			content: `Article Originally Posted At: [https://www.splatoonstronghold.com/news/superjump-7](https://www.splatoonstronghold.com/news/superjump-7)\n\n# **SuperJump 7: 2025’s Hypest Grand Finals**\n\n${PARAGRAPH}`,
			expected: PARAGRAPH,
		},
		{
			why: "a section heading",
			content: `## **Turf War Always Applies**\n\n${PARAGRAPH}`,
			expected: PARAGRAPH,
		},
		{
			why: "a plain line repeating the title in another case",
			content: `RESULTS FROM RIPTIDE 2025  \n${PARAGRAPH}`,
			expected: PARAGRAPH,
		},
		{
			why: "an italic subtitle heading",
			content:
				"#### *Dapple Productions brings back the 20XX major for the first time since 2024*\n\n<img src='https://example.com/banner.png' />",
			expected:
				"Dapple Productions brings back the 20XX major for the first time since 2024",
		},
		{
			why: "an italic subtitle heading with an escaped exclamation mark",
			content: "#### *…and their allies, too\\!* \n",
			expected: "…and their allies, too!",
		},
		{
			why: "an italic subtitle line under the title heading",
			content:
				"# **Waving Goodbye**\n*Riptide 2025 was just the start to a wave of top-level players stepping back*",
			expected:
				"Riptide 2025 was just the start to a wave of top-level players stepping back",
		},
		{
			why: "a paragraph with a link and emphasis",
			content:
				"The main hub is the [Chronically Krill Discord server](https://discord.com/invite/x), **open to everyone**.",
			expected:
				"The main hub is the Chronically Krill Discord server, open to everyone.",
		},
		{
			why: "a paragraph with escaped markdown",
			content: "With the conclusion of Event \\#5 (Week 3\\), 20XX Series 6\\.",
			expected: "With the conclusion of Event #5 (Week 3), 20XX Series 6.",
		},
		{
			why: "a heading of the title with curly quotes",
			content: `# **Splatoon’s “Great Retirement”**\n\n${PARAGRAPH}`,
			title: `Splatoon's ''Great Retirement''`,
			expected: PARAGRAPH,
		},
		{
			why: "a horizontal rule",
			content: `---\n\n${PARAGRAPH}`,
			expected: PARAGRAPH,
		},
		{
			why: "a table separator",
			content: `| :--- | ---: |\n${PARAGRAPH}`,
			expected: PARAGRAPH,
		},
		{
			why: "an html comment",
			content: `<!-- banner goes here -->\n${PARAGRAPH}`,
			expected: PARAGRAPH,
		},
		{
			why: "a blockquote",
			content: `> ${PARAGRAPH}`,
			expected: PARAGRAPH,
		},
		{
			why: "a list item",
			content: `- ${PARAGRAPH}`,
			expected: PARAGRAPH,
		},
		{
			why: "a numbered list item",
			content: `1. ${PARAGRAPH}`,
			expected: PARAGRAPH,
		},
		{
			why: "underscores within words",
			content: "Use the snake_case_name here.",
			expected: "Use the snake_case_name here.",
		},
		{
			why: "underscore, code and strikethrough markup",
			content: "An _italic_, __bold__, `code` and ~~struck~~ word.",
			expected: "An italic, bold, code and struck word.",
		},
		{
			why: "angle brackets in prose",
			content: "Short range < long range and the meta -> chaos.",
			expected: "Short range < long range and the meta -> chaos.",
		},
	])("describes a body starting with $why", ({ content, title, expected }) => {
		expect(Article.description(content, title ?? TITLE)).toBe(expected);
	});

	test.each([
		{ why: "empty", content: "" },
		{
			why: "only a source notice and a banner",
			content: `Article originally posted at: [x](https://example.com)\n\n<img src="https://example.com/banner.png" />`,
		},
		{ why: "only headings", content: `# ${TITLE}\n\n## Introduction` },
	])("is null for a body that is $why", ({ content }) => {
		expect(Article.description(content, TITLE)).toBeNull();
	});

	test("cuts a long paragraph at the last sentence that fits", () => {
		const first = "a".repeat(100);
		const second = "b".repeat(100);

		expect(Article.description(`${first}. ${second}.`, TITLE)).toBe(
			`${first}.`,
		);
	});

	test("cuts a long sentence at a word boundary with an ellipsis", () => {
		const words = Array.from({ length: 40 }, () => "splat").join(", ");

		const description = Article.description(words, TITLE);

		expect(description?.length).toBeLessThanOrEqual(160);
		expect(description).toMatch(/ splat…$/);
	});

	test("doesn't end a cut sentence at an abbreviation", () => {
		const start = `${"a".repeat(140)} organized 4 vs. 4`;

		expect(
			Article.description(`${start} matches, with many more words.`, TITLE),
		).toBe(`${start}…`);
	});
});
