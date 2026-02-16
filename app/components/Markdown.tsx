import MarkdownToJsx from "markdown-to-jsx";
import * as React from "react";

// note: markdown-to-jsx also handles these, this is just to prevent them from appearing as plain text
const DANGEROUS_HTML_TAGS_REGEX =
	/<(style|iframe|script|title|textarea|xmp|noembed|noframes|plaintext)[\s\S]*?<\/\1>|<(style|iframe|script|title|textarea|xmp|noembed|noframes|plaintext)[^>]*\/>/gi;

const CSS_URL_REGEX = /url\s*\([^)]*\)/gi;

export function Markdown({ children }: { children: string }) {
	const sanitized = children
		.replace(DANGEROUS_HTML_TAGS_REGEX, "")
		.replace(/style\s*=\s*("[^"]*"|'[^']*')/gi, (_match, value) => {
			const sanitized = value.replace(CSS_URL_REGEX, "");
			return `style=${sanitized}`;
		});

	return (
		<MarkdownToJsx
			options={{
				wrapper: React.Fragment,
				overrides: {
					br: { component: () => <br /> },
					hr: { component: () => <hr /> },
					img: {
						component: (props: React.ComponentProps<"img">) => (
							// biome-ignore lint/a11y/useAltText: parsed markdown, so we can't guarantee alt text is present
							<img {...props} />
						),
					},
				},
			}}
		>
			{sanitized}
		</MarkdownToJsx>
	);
}
