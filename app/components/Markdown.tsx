import { compiler, type MarkdownToJSX } from "markdown-to-jsx/react";
import * as React from "react";
import * as MarkdownHtml from "~/utils/markdown-html";

// note: markdown-to-jsx also handles these, this is just to prevent them from appearing as plain text
const DANGEROUS_HTML_TAGS_REGEX =
	/<(style|link|head|iframe|script|title|textarea|xmp|noembed|noframes|plaintext)[\s\S]*?<\/\1>|<(style|link|head|iframe|script|title|textarea|xmp|noembed|noframes|plaintext)[^>]*\/>/gi;

const CSS_URL_REGEX = /url\s*\([^)]*\)/gi;

export function Markdown({ children }: { children: string }) {
	const sanitized = children
		.replace(DANGEROUS_HTML_TAGS_REGEX, "")
		.replace(/style\s*=\s*("[^"]*"|'[^']*')/gi, (_match, value) => {
			const withoutUrls = value.replace(CSS_URL_REGEX, "");
			return `style=${withoutUrls}`;
		})
		.replace(/ +$/gm, "");

	const options: MarkdownToJSX.Options = {
		wrapper: React.Fragment,
		createElement: createAllowlistedElement,
	};

	try {
		return compiler(sanitized, options);
	} catch {
		// markdown-to-jsx can overflow the stack on malformed html e.g. `<div a's>x</div>\nhi`
		return compiler(sanitized, { ...options, disableParsingRawHTML: true });
	}
}

function createAllowlistedElement(
	tag: Parameters<typeof React.createElement>[0],
	props: React.JSX.IntrinsicAttributes,
	...children: React.ReactNode[]
) {
	if (typeof tag !== "string") {
		return React.createElement(tag, props, ...children);
	}

	const element = MarkdownHtml.sanitizeElement(
		tag,
		(props ?? {}) as Record<string, unknown>,
	);
	if (!element) {
		return React.createElement(
			React.Fragment,
			{ key: props?.key },
			...children,
		);
	}

	return element.isVoid
		? React.createElement(element.tag, element.props)
		: React.createElement(element.tag, element.props, ...children);
}
