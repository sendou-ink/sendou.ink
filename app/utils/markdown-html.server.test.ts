import { describe, expect, test } from "vitest";
import * as MarkdownHtml from "./markdown-html.server";

describe("MarkdownHtml.render", () => {
	test.each([
		{
			why: "meta refresh redirect",
			markdown: `hi <meta http-equiv="refresh" content="0;url=https://evil.example"> there`,
			forbidden: "<meta",
		},
		{
			why: "base href hijack",
			markdown: `<base href="https://evil.example/">[x](/relative)`,
			forbidden: "<base",
		},
		{
			why: "stylesheet link",
			markdown: `<link rel="stylesheet" href="https://evil.example/x.css">`,
			forbidden: "<link",
		},
		{
			why: "iframe",
			markdown: `<iframe src="https://evil.example"></iframe>`,
			forbidden: "<iframe",
		},
		{
			why: "object",
			markdown: `<object data="https://evil.example"></object>`,
			forbidden: "<object",
		},
		{
			why: "embed",
			markdown: `<embed src="https://evil.example">`,
			forbidden: "<embed",
		},
		{
			why: "phishing form",
			markdown: `<form action="https://evil.example"><input name="pw"></form>`,
			forbidden: "<form",
		},
		{
			why: "non-checkbox input",
			markdown: `<input type="text" value="x">`,
			forbidden: "<input",
		},
		{
			why: "svg href animation",
			markdown: `<svg><a><set attributeName="href" to="javascript:alert(1)"/><text>x</text></a></svg>`,
			forbidden: "<set",
		},
		{
			why: "svg use",
			markdown: `<svg><use href="#x"></use></svg>`,
			forbidden: "<use",
		},
		{
			why: "event handler",
			markdown: `<div onclick="alert(1)">c</div>`,
			forbidden: "onclick",
		},
		{
			why: "id outside headings and svg",
			markdown: `<div id="clobber">c</div>`,
			forbidden: "clobber",
		},
		{
			why: "data attributes",
			markdown: `<div data-testid="x">c</div>`,
			forbidden: "data-testid",
		},
		{
			why: "javascript link in markdown",
			markdown: "[x](javascript:alert(1))",
			forbidden: "javascript",
		},
		{
			why: "entity encoded javascript link",
			markdown: `<a href="&#106;avascript:alert(1)">x</a>`,
			forbidden: "avascript",
		},
		{
			why: "percent encoded javascript link",
			markdown: `<a href="java%0ascript:alert(1)">x</a>`,
			forbidden: "script",
		},
		{
			why: "script contents",
			markdown: "<script>alert(1)</script>",
			forbidden: "alert",
		},
		{
			why: "style contents",
			markdown: "<style>body { display: none }</style>",
			forbidden: "display",
		},
		{
			why: "comments",
			markdown: "a <!-- secret --> b",
			forbidden: "secret",
		},
		{
			why: "user-supplied referrer policy",
			markdown: `<img src="https://x/a.png" referrerpolicy="unsafe-url">`,
			forbidden: "unsafe-url",
		},
	])("does not render $why", ({ markdown, forbidden }) => {
		expect(MarkdownHtml.render(markdown)).not.toContain(forbidden);
	});

	test("closes formatting left open so it does not carry on past the markdown", () => {
		expect(MarkdownHtml.render("<b>bold\n\nnext")).toBe(
			"<p><b>bold</b></p><p>next</p>",
		);
	});

	test.each([
		{
			why: "standard markdown",
			markdown:
				"## Rules\n\n**bold** [link](https://x)\n\n```js\nconst a = 1;\n```",
			expected: `<h2 id="rules">Rules</h2><p><strong>bold</strong> <a href="https://x">link</a></p><pre><code class="language-js">const a = 1;\n</code></pre>`,
		},
		{
			why: "the text content of an unknown element",
			markdown: `<TextType align="center"><font color="red">hi</font></TextType>`,
			expected: `<p><font color="red">hi</font></p>`,
		},
		{
			why: "a prototype-named element as text",
			markdown: `<constructor href="x">text</constructor>`,
			expected: "<p>text</p>",
		},
		{
			why: "task lists",
			markdown: "- [ ] todo\n- [x] done",
			expected: `<ul><li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" disabled>todo</li><li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" disabled checked>done</li></ul>`,
		},
		{
			why: "new-tab links with a forced rel",
			markdown: `<a href="https://x" target="_blank" rel="opener">x</a>`,
			expected: `<p><a href="https://x" target="_blank" rel="noopener noreferrer">x</a></p>`,
		},
		{
			why: "inline styles without url()",
			markdown: `<span style="color: red; background: url(https://x/a.png)">a</span>`,
			expected: `<p><span style="color: red; background: ">a</span></p>`,
		},
		{
			why: "images with no-referrer forced",
			markdown: "![alt](https://x/a.png)",
			expected: `<p><img src="https://x/a.png" alt="alt" referrerpolicy="no-referrer" /></p>`,
		},
		{
			why: "markdown inside html without blank lines around it",
			markdown: `<div align="center">\n## Title\n- item\n</div>`,
			expected: `<div align="center"><h2 id="title">Title</h2><ul><li>item</div></li></ul>`,
		},
		{
			why: "html wrapping paragraphs without empty paragraphs around it",
			markdown: `<div align="center">\n\n**hi**\n\n</div>`,
			expected: `<div align="center"><p><strong>hi</strong></p></div>`,
		},
		{
			why: "indented html as html instead of a code block",
			markdown: "a\n\n    <b>bold</b>",
			expected: "<p>a</p><p><b>bold</b></p>",
		},
		{
			why: "soft line breaks the author typed",
			markdown: "line 1\nline 2",
			expected: "<p>line 1\nline 2</p>",
		},
		{
			why: "urls the markdown parser misses as links",
			markdown: "https://docs.google.com/a/edit?gid=0#gid=0",
			expected: `<p><a href="https://docs.google.com/a/edit?gid=0#gid=0">https://docs.google.com/a/edit?gid=0#gid=0</a></p>`,
		},
		{
			why: "urls with an @ as links",
			markdown: "watch https://youtube.com/@channel.",
			expected: `<p>watch <a href="https://youtube.com/@channel">https://youtube.com/@channel</a>.</p>`,
		},
		{
			why: "escaped text",
			markdown: "a &lt;b&gt; &amp; c",
			expected: "<p>a &lt;b&gt; &amp; c</p>",
		},
	])("renders $why", ({ markdown, expected }) => {
		expect(MarkdownHtml.render(markdown)).toBe(expected);
	});

	test("renders inline svg gradients authored by users", () => {
		const html = MarkdownHtml.render(
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"></stop><animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="1 1" dur="4s" repeatCount="indefinite"></animateTransform></linearGradient></defs><rect width="10" height="10" fill="url(#g)"></rect></svg>`,
		);

		expect(html).toContain('<linearGradient id="g">');
		expect(html).toContain('<stop offset="0" stop-color="#fff">');
		expect(html).toContain(
			'<animateTransform attributeName="gradientTransform"',
		);
		expect(html).toContain('fill="url(#g)"');
	});

	test("renders video with sources", () => {
		expect(
			MarkdownHtml.render(
				`<video controls>\n  <source src="https://files.example/x.mp4" type="video/mp4">\nfallback\n</video>`,
			),
		).toBe(
			`<p><video controls>\n<source src="https://files.example/x.mp4" type="video/mp4">\nfallback\n</video></p>`,
		);
	});

	test("renders malformed html", () => {
		const html = MarkdownHtml.render(
			`<div a's>x</div>\n![alt](https://x/a.png)`,
		);

		expect(html).toContain(`<img src="https://x/a.png" alt="alt"`);
	});
});
