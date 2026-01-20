import MarkdownToJsx from "markdown-to-jsx";
import * as React from "react";

// note: markdown-to-jsx also handles these, this is just to prevent them from appearing as plain text
const DANGEROUS_HTML_TAGS_REGEX =
	/<(style|iframe|script|title|textarea|xmp|noembed|noframes|plaintext)[\s\S]*?<\/\1>|<(style|iframe|script|title|textarea|xmp|noembed|noframes|plaintext)[^>]*\/>/gi;

// note: this is not handled by markdown-to-jsx currently
const INLINE_STYLE_REGEX = /\s*style\s*=\s*(?:"[^"]*"|'[^']*')/gi;

export function Markdown({ children }: { children: string }) {
	const sanitized = children
		.replace(DANGEROUS_HTML_TAGS_REGEX, "")
		.replace(INLINE_STYLE_REGEX, "");

	return (
		<MarkdownToJsx options={{ wrapper: React.Fragment }}>
			{sanitized}
		</MarkdownToJsx>
	);
}
