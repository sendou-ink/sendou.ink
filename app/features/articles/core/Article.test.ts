import { describe, expect, test } from "vitest";
import * as Article from "./Article";

const SOURCE_NOTICE =
	"Article originally posted at: [https://www.splatoonstronghold.com/news/results-from-riptide-2025](https://www.splatoonstronghold.com/news/results-from-riptide-2025)";
const BANNER =
	'<img width="1200" height="675" alt="banner" src="banner.png" />';

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
