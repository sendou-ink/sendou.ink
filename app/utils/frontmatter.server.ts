const FRONTMATTER_PATTERN = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Splits a markdown file into its YAML frontmatter and the markdown content after it.
 * Bun-only: callers are server loaders, scripts and unit tests, all of which run on Bun.
 */
export function parseFrontmatter(markdown: string): {
	data: Record<string, unknown>;
	content: string;
} {
	const match = FRONTMATTER_PATTERN.exec(markdown);
	if (!match) return { data: {}, content: markdown };

	return {
		data: (Bun.YAML.parse(match[1]) ?? {}) as Record<string, unknown>,
		content: markdown.slice(match[0].length),
	};
}
