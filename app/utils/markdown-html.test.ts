import { describe, expect, test } from "vitest";
import * as MarkdownHtml from "./markdown-html";

describe("MarkdownHtml.sanitizeElement", () => {
	test.each([
		{ why: "meta", tag: "meta", props: { httpEquiv: "refresh" } },
		{ why: "base", tag: "base", props: { href: "https://evil.example/" } },
		{ why: "link", tag: "link", props: { rel: "stylesheet", href: "x.css" } },
		{ why: "iframe", tag: "iframe", props: { src: "https://evil.example" } },
		{ why: "object", tag: "object", props: { data: "https://evil.example" } },
		{ why: "embed", tag: "embed", props: { src: "https://evil.example" } },
		{ why: "form", tag: "form", props: { action: "https://evil.example" } },
		{ why: "script", tag: "script", props: {} },
		{ why: "style", tag: "style", props: {} },
		{ why: "textarea", tag: "textarea", props: {} },
		{ why: "title", tag: "title", props: {} },
		{ why: "xmp", tag: "xmp", props: {} },
		{ why: "noembed", tag: "noembed", props: {} },
		{ why: "noframes", tag: "noframes", props: {} },
		{ why: "plaintext", tag: "plaintext", props: {} },
		{ why: "head", tag: "head", props: {} },
		{ why: "svg use", tag: "use", props: { href: "#x" } },
		{ why: "svg set", tag: "set", props: { attributeName: "href" } },
		{ why: "svg animate", tag: "animate", props: { attributeName: "href" } },
		{ why: "svg image", tag: "image", props: { href: "https://x/a.png" } },
		{ why: "svg foreignObject", tag: "foreignObject", props: {} },
		{ why: "unknown custom tag", tag: "TextType", props: { align: "center" } },
		{ why: "constructor", tag: "constructor", props: { href: "x" } },
		{ why: "toString", tag: "toString", props: { href: "x" } },
		{ why: "hasOwnProperty", tag: "hasOwnProperty", props: { href: "x" } },
		{ why: "__proto__", tag: "__proto__", props: { href: "x" } },
		{ why: "non-checkbox input", tag: "input", props: { type: "text" } },
	])("refuses $why", ({ tag, props }) => {
		expect(MarkdownHtml.sanitizeElement(tag, props)).toBeNull();
	});

	test.each([
		{
			why: "event handlers",
			tag: "div",
			props: { onClick: "alert(1)", onerror: "alert(1)", style: "color:red" },
			expected: { style: "color:red" },
		},
		{
			why: "data attributes",
			tag: "div",
			props: { "data-testid": "x", className: "box" },
			expected: { className: "box" },
		},
		{
			why: "id outside headings and svg",
			tag: "div",
			props: { id: "clobber" },
			expected: {},
		},
		{
			why: "user-supplied referrer policy on images",
			tag: "img",
			props: { src: "a.png", referrerpolicy: "unsafe-url", alt: "" },
			expected: { src: "a.png", alt: "", referrerPolicy: "no-referrer" },
		},
		{
			why: "authored rel on new-tab links",
			tag: "a",
			props: { href: "https://x", target: "_blank", rel: "opener" },
			expected: {
				href: "https://x",
				target: "_blank",
				rel: "noopener noreferrer",
			},
		},
		{
			why: "empty class name",
			tag: "code",
			props: { className: "" },
			expected: {},
		},
		{
			why: "unlisted anchor attributes",
			tag: "a",
			props: { href: "https://x", download: "x", ping: "y" },
			expected: { href: "https://x" },
		},
		{
			why: "authored rel on same-tab links",
			tag: "a",
			props: { href: "https://x", rel: "opener" },
			expected: { href: "https://x" },
		},
	])("drops $why", ({ tag, props, expected }) => {
		expect(MarkdownHtml.sanitizeElement(tag, props)?.props).toEqual(expected);
	});

	test.each([
		{
			why: "heading ids generated for anchors",
			tag: "h2",
			props: { id: "rules", key: 3 },
			expected: { id: "rules", key: 3 },
		},
		{
			why: "hyphenated svg attributes",
			tag: "stop",
			props: { offset: "0", "stop-color": "#fff" },
			expected: { offset: "0", "stop-color": "#fff" },
		},
		{
			why: "camel-cased svg tags and attributes",
			tag: "linearGradient",
			props: {
				id: "g",
				gradientUnits: "userSpaceOnUse",
				spreadMethod: "repeat",
			},
			expected: {
				id: "g",
				gradientUnits: "userSpaceOnUse",
				spreadMethod: "repeat",
			},
		},
		{
			why: "task list checkboxes",
			tag: "input",
			props: { type: "checkbox", checked: true, readOnly: true },
			expected: { type: "checkbox", checked: true, readOnly: true },
		},
		{
			why: "legacy font colors",
			tag: "font",
			props: { color: "#B8860B" },
			expected: { color: "#B8860B" },
		},
		{
			why: "video sources",
			tag: "source",
			props: { src: "https://x/a.mp4", type: "video/mp4" },
			expected: { src: "https://x/a.mp4", type: "video/mp4" },
		},
	])("keeps $why", ({ tag, props, expected }) => {
		expect(MarkdownHtml.sanitizeElement(tag, props)?.props).toEqual(expected);
	});

	test("preserves the original tag casing so React can render svg elements", () => {
		expect(MarkdownHtml.sanitizeElement("linearGradient", {})?.tag).toBe(
			"linearGradient",
		);
	});

	test.each([
		{ tag: "br", isVoid: true },
		{ tag: "img", isVoid: true },
		{ tag: "div", isVoid: false },
	])("marks $tag void: $isVoid", ({ tag, isVoid }) => {
		expect(MarkdownHtml.sanitizeElement(tag, {})?.isVoid).toBe(isVoid);
	});
});
