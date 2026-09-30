import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Markdown } from "./Markdown";

function render(markdown: string) {
	return renderToStaticMarkup(<Markdown>{markdown}</Markdown>);
}

describe("Markdown", () => {
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
			why: "void stylesheet link",
			markdown: `<link rel="stylesheet" href="https://evil.example/x.css">`,
			forbidden: "<link",
		},
		{
			why: "self-closing stylesheet link",
			markdown: `<link rel="stylesheet" href="https://evil.example/x.css"/>`,
			forbidden: "<link",
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
			why: "svg href animation",
			markdown: `<svg><a><set attributeName="href" to="javascript:alert(1)"/><text>x</text></a></svg>`,
			forbidden: "<set",
		},
		{
			why: "event handler",
			markdown: `<div onclick="alert(1)">c</div>`,
			forbidden: "onclick",
		},
	])("does not render $why", ({ markdown, forbidden }) => {
		expect(render(markdown)).not.toContain(forbidden);
	});

	test("renders inline svg gradients authored by users", () => {
		const html = render(
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"></stop><animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="1 1" dur="4s" repeatCount="indefinite"></animateTransform></linearGradient></defs><rect width="10" height="10" fill="url(#g)"></rect></svg>`,
		);

		expect(html).toContain('<linearGradient id="g">');
		expect(html).toContain(
			'<animateTransform attributeName="gradientTransform"',
		);
		expect(html).toContain('fill="url(#g)"');
	});

	test("forces no-referrer on images regardless of the authored policy", () => {
		const html = render(
			`<img src="https://x/a.png" referrerpolicy="unsafe-url" alt="a">`,
		);

		expect(html).toContain(
			`<img src="https://x/a.png" alt="a" referrerPolicy="no-referrer"/>`,
		);
		expect(html).not.toContain("unsafe-url");
	});

	test.each([
		{
			why: "the text content of an unknown element",
			markdown: `<TextType align="center"><font color="red">hi</font></TextType>`,
			expected: `<font color="red">hi</font>`,
		},
		{
			why: "a prototype-named element as text",
			markdown: `<constructor href="x">text</constructor>`,
			expected: "text",
		},
		{
			why: "video with sources",
			markdown: `<video controls>\n  <source src="https://files.example/x.mp4" type="video/mp4">\nfallback\n</video>`,
			expected: `<video controls=""><source src="https://files.example/x.mp4" type="video/mp4"/> fallback </video>`,
		},
		{
			why: "task lists",
			markdown: "- [ ] todo\n- [x] done",
			expected: `<ul><li><input readOnly="" type="checkbox"/> todo</li><li><input readOnly="" type="checkbox" checked=""/> done</li></ul>`,
		},
		{
			why: "standard markdown",
			markdown:
				"## Rules\n\n**bold** [link](https://x)\n\n```js\nconst a = 1;\n```",
			expected: `<h2 id="rules">Rules</h2><p><strong>bold</strong> <a href="https://x">link</a></p><pre><code class="language-js lang-js">const a = 1;</code></pre>`,
		},
		{
			why: "new-tab links with a forced rel",
			markdown: `<a href="https://x" target="_blank" rel="opener">x</a>`,
			expected: `<a href="https://x" target="_blank" rel="noopener noreferrer">x</a>`,
		},
		{
			why: "inline styles without url()",
			markdown: `<span style="color: red; background: url(https://x/a.png)">a</span>`,
			expected: `<span style="color:red">a</span>`,
		},
	])("renders $why", ({ markdown, expected }) => {
		expect(render(markdown)).toBe(expected);
	});
});
