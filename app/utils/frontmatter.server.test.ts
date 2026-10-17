import { describe, expect, test } from "bun:test";
import { parseFrontmatter } from "./frontmatter.server";

describe("parseFrontmatter", () => {
	test.each([
		{
			why: "bare and quoted scalars",
			frontmatter: `title: "Hello: \\"world\\""\nsubtitle: 'It''s here'\ndate: 2026-03-17`,
			data: {
				title: 'Hello: "world"',
				subtitle: "It's here",
				date: "2026-03-17",
			},
		},
		{
			why: "flow list",
			frontmatter: "navItem: [calendar, scrims]",
			data: { navItem: ["calendar", "scrims"] },
		},
		{
			why: "block list of maps",
			frontmatter:
				"author:\n   - name: YELLOW\n     link: https://sendou.ink/u/yellow\n   - name: Other",
			data: {
				author: [
					{ name: "YELLOW", link: "https://sendou.ink/u/yellow" },
					{ name: "Other" },
				],
			},
		},
		{
			why: "block list at the key's indentation",
			frontmatter: "author:\n- Sendou\n- name: N-ZAP\n  link: https://x.com",
			data: { author: ["Sendou", { name: "N-ZAP", link: "https://x.com" }] },
		},
		{
			why: "comments",
			frontmatter: "# a comment\ntype: bug # trailing",
			data: { type: "bug" },
		},
	])("parses $why", ({ frontmatter, data }) => {
		expect(parseFrontmatter(`---\n${frontmatter}\n---\nBody`)).toEqual({
			data,
			content: "Body",
		});
	});

	test.each([
		{ why: "a nested map", frontmatter: "author:\n  name: Sendou" },
		{ why: "a block scalar", frontmatter: "title: |\n  multi" },
		{ why: "a flow map", frontmatter: "author: { name: Sendou }" },
		{ why: "an unclosed quote", frontmatter: 'title: "Hello' },
		{ why: "a list item without a key", frontmatter: "- Sendou" },
	])("throws on $why", ({ frontmatter }) => {
		expect(() => parseFrontmatter(`---\n${frontmatter}\n---\n`)).toThrow(
			"Unsupported frontmatter syntax",
		);
	});

	test("returns the whole file as content without frontmatter", () => {
		expect(parseFrontmatter("# Title")).toEqual({
			data: {},
			content: "# Title",
		});
	});
});
