import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BUN_MARKDOWN_OPTIONS = {
	headings: { ids: true },
	autolinks: true,
	// users mix HTML and markdown without blank lines and indent their HTML
	noHtmlBlocks: true,
	noIndentedCodeBlocks: true,
} satisfies Bun.markdown.Options;

const GLOBAL_ATTRIBUTES = attributeSet(
	"align",
	"class",
	"dir",
	"height",
	"style",
	"title",
	"width",
);

const HEADING_ATTRIBUTES = attributeSet("id");

const TABLE_CELL_ATTRIBUTES = attributeSet("colspan", "rowspan", "valign");

const SVG_PRESENTATION_ATTRIBUTES = attributeSet(
	"fill",
	"fillopacity",
	"fillrule",
	"opacity",
	"stroke",
	"strokedasharray",
	"strokelinecap",
	"strokelinejoin",
	"strokeopacity",
	"strokewidth",
	"transform",
);

const SVG_GRADIENT_ATTRIBUTES = attributeSet(
	"id",
	"gradientunits",
	"gradienttransform",
	"spreadmethod",
	...SVG_PRESENTATION_ATTRIBUTES,
);

/** Elements user markdown may render, mapped to the attributes allowed on them (lower-cased, hyphens removed) in addition to {@link GLOBAL_ATTRIBUTES}. Anything else is unwrapped so only its text content survives. */
const ALLOWED_ELEMENTS: Record<string, ReadonlySet<string>> = {
	a: attributeSet("href", "target"),
	abbr: attributeSet(),
	b: attributeSet(),
	blockquote: attributeSet(),
	br: attributeSet(),
	center: attributeSet(),
	code: attributeSet(),
	dd: attributeSet(),
	del: attributeSet(),
	details: attributeSet("open"),
	div: attributeSet(),
	dl: attributeSet(),
	dt: attributeSet(),
	em: attributeSet(),
	figcaption: attributeSet(),
	figure: attributeSet(),
	font: attributeSet("color", "face", "size"),
	h1: HEADING_ATTRIBUTES,
	h2: HEADING_ATTRIBUTES,
	h3: HEADING_ATTRIBUTES,
	h4: HEADING_ATTRIBUTES,
	h5: HEADING_ATTRIBUTES,
	h6: HEADING_ATTRIBUTES,
	hr: attributeSet(),
	i: attributeSet(),
	img: attributeSet("src", "alt", "loading", "border"),
	input: attributeSet("type", "checked", "readonly", "disabled"),
	ins: attributeSet(),
	kbd: attributeSet(),
	li: attributeSet("value"),
	mark: attributeSet(),
	ol: attributeSet("start", "type", "reversed"),
	p: attributeSet(),
	picture: attributeSet(),
	pre: attributeSet(),
	s: attributeSet(),
	small: attributeSet(),
	source: attributeSet("src", "srcset", "type", "media"),
	span: attributeSet(),
	strike: attributeSet(),
	strong: attributeSet(),
	sub: attributeSet(),
	summary: attributeSet(),
	sup: attributeSet(),
	table: attributeSet("border", "cellpadding", "cellspacing"),
	tbody: attributeSet(),
	td: TABLE_CELL_ATTRIBUTES,
	tfoot: attributeSet(),
	th: attributeSet("scope", ...TABLE_CELL_ATTRIBUTES),
	thead: attributeSet(),
	tr: attributeSet("valign"),
	u: attributeSet(),
	ul: attributeSet("start"),
	video: attributeSet(
		"src",
		"poster",
		"controls",
		"autoplay",
		"loop",
		"muted",
		"playsinline",
		"preload",
	),
	svg: attributeSet(
		"xmlns",
		"viewbox",
		"preserveaspectratio",
		...SVG_PRESENTATION_ATTRIBUTES,
	),
	g: SVG_PRESENTATION_ATTRIBUTES,
	defs: attributeSet(),
	path: attributeSet("d", ...SVG_PRESENTATION_ATTRIBUTES),
	rect: attributeSet("x", "y", "rx", "ry", ...SVG_PRESENTATION_ATTRIBUTES),
	circle: attributeSet("cx", "cy", "r", ...SVG_PRESENTATION_ATTRIBUTES),
	ellipse: attributeSet("cx", "cy", "rx", "ry", ...SVG_PRESENTATION_ATTRIBUTES),
	line: attributeSet("x1", "y1", "x2", "y2", ...SVG_PRESENTATION_ATTRIBUTES),
	polyline: attributeSet("points", ...SVG_PRESENTATION_ATTRIBUTES),
	polygon: attributeSet("points", ...SVG_PRESENTATION_ATTRIBUTES),
	text: attributeSet(
		"x",
		"y",
		"dx",
		"dy",
		"textanchor",
		"fontsize",
		...SVG_PRESENTATION_ATTRIBUTES,
	),
	lineargradient: attributeSet(
		"x1",
		"y1",
		"x2",
		"y2",
		...SVG_GRADIENT_ATTRIBUTES,
	),
	radialgradient: attributeSet(
		"cx",
		"cy",
		"r",
		"fx",
		"fy",
		...SVG_GRADIENT_ATTRIBUTES,
	),
	stop: attributeSet("offset", "stopcolor", "stopopacity"),
	animatetransform: attributeSet(
		"attributename",
		"type",
		"from",
		"to",
		"by",
		"values",
		"dur",
		"begin",
		"repeatcount",
		"additive",
		"accumulate",
		"fill",
	),
};

/** Elements dropped together with everything inside them, as their content would otherwise show up as plain text */
const DROPPED_WITH_CONTENT_ELEMENTS = new Set([
	"head",
	"iframe",
	"noembed",
	"noframes",
	"plaintext",
	"script",
	"style",
	"textarea",
	"title",
	"xmp",
]);

/** Newlines next to these are formatting from the markdown renderer, not line breaks the author typed */
const BLOCK_ELEMENTS = new Set([
	"blockquote",
	"center",
	"dd",
	"details",
	"div",
	"dl",
	"dt",
	"figcaption",
	"figure",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"hr",
	"li",
	"ol",
	"p",
	"pre",
	"summary",
	"table",
	"tbody",
	"td",
	"tfoot",
	"th",
	"thead",
	"tr",
	"ul",
]);

const LEADING_NEWLINE_REGEX = /^[ \t\r\n]*\n[ \t\r\n]*/;
const TRAILING_NEWLINE_REGEX = /[ \t\r\n]*\n[ \t\r\n]*$/;
/** Without HTML blocks a line with only e.g. `<div align="center">` becomes a paragraph of its own, which the browser would split into empty paragraphs */
const BLOCK_TAGS_ONLY_PARAGRAPH_REGEX = new RegExp(
	`<p>((?:</?(?:${[...BLOCK_ELEMENTS].join("|")})\\b[^>]*>\\s*)*)</p>`,
	"g",
);

/** Bun's autolinks miss some URLs, such as ones with an @ (`youtube.com/@channel`) or Google Docs links with `#gid=` */
const BARE_URL_REGEX = /https?:\/\/[^\s<>"]+/g;
const URL_TRAILING_PUNCTUATION_REGEX = /[.,:;!?'")\]*_~]+$/;
/** Elements the browser reopens after they are implicitly closed, see "active formatting elements" in the HTML spec */
const FORMATTING_ELEMENTS = new Set([
	"a",
	"b",
	"code",
	"em",
	"font",
	"i",
	"s",
	"small",
	"strike",
	"strong",
	"u",
]);
const UNLINKABLE_ELEMENTS = new Set(["a", "code", "pre"]);

const URL_ATTRIBUTES = new Set(["href", "src", "poster"]);
const UNSAFE_URL_REGEX = /(javascript|vbscript|data(?!:image)):/i;
const CSS_URL_REGEX = /url\s*\([^)]*\)/gi;

const NEW_TAB_LINK_REL = "noopener noreferrer";

/**
 * Renders user-authored markdown (articles, tournament descriptions, bios...) to HTML that is safe to set as `innerHTML`.
 * Raw HTML in the markdown is filtered down to an allowlist of elements and attributes.
 * Tags are not balanced, so a stray closing tag (e.g. an extra `</div>`) can still break the layout around the output.
 *
 * @example
 * MarkdownHtml.render("**hi** <img src=x onerror=alert(1)>")
 * // -> '<p><strong>hi</strong> <img src=x referrerpolicy="no-referrer"></p>'
 */
export function render(markdown: string): string {
	if (typeof Bun === "undefined") return renderInBunProcess(markdown);

	return sanitize(
		Bun.markdown.html(markdown.replace(/ +$/gm, ""), BUN_MARKDOWN_OPTIONS),
	);
}

/** Bun.markdown and HTMLRewriter are Bun only but unit tests run on Node */
function renderInBunProcess(markdown: string) {
	return execFileSync(
		"bun",
		[
			"--no-env-file",
			"--eval",
			`import { render } from ${JSON.stringify(fileURLToPath(import.meta.url))}; process.stdout.write(render(await Bun.stdin.text()))`,
		],
		{ input: markdown, encoding: "utf8" },
	);
}

function sanitize(html: string) {
	let droppedDepth = 0;
	let preDepth = 0;
	let unlinkableDepth = 0;
	let isAfterBlockTag = true;
	let pendingWhitespace = "";

	const onTag = (
		tag: HTMLRewriterTypes.Element | HTMLRewriterTypes.EndTag,
		tagName: string,
	) => {
		const isBlock = BLOCK_ELEMENTS.has(tagName);
		if (pendingWhitespace && !isAfterBlockTag && !isBlock) {
			tag.before(pendingWhitespace, { html: true });
		}
		pendingWhitespace = "";
		isAfterBlockTag = isBlock;
	};

	const result = new HTMLRewriter()
		.on("*", {
			element(element) {
				const tagName = element.tagName;
				if (droppedDepth > 0) return;

				if (DROPPED_WITH_CONTENT_ELEMENTS.has(tagName)) {
					element.remove();
					if (element.canHaveContent && !element.selfClosing) {
						droppedDepth++;
						element.onEndTag(() => {
							droppedDepth--;
						});
					}
					return;
				}

				if (!sanitizeElement(element)) {
					element.removeAndKeepContent();
					return;
				}

				onTag(element, tagName);
				if (!element.canHaveContent || element.selfClosing) return;

				if (tagName === "pre") preDepth++;
				if (UNLINKABLE_ELEMENTS.has(tagName)) unlinkableDepth++;
				element.onEndTag((endTag) => {
					// e.g. `<p><b>bold</p>`, else the browser carries the bold on past the end of the markdown
					if (endTag.name !== tagName && FORMATTING_ELEMENTS.has(tagName)) {
						endTag.before(`</${tagName}>`, { html: true });
					}
					if (tagName === "pre") preDepth--;
					if (UNLINKABLE_ELEMENTS.has(tagName)) unlinkableDepth--;
					onTag(endTag, tagName);
				});
			},
		})
		.onDocument({
			comments(comment) {
				comment.remove();
			},
			text(chunk) {
				const text = chunk.text;
				if (droppedDepth > 0 || !text) return;

				const mayLinkify = unlinkableDepth === 0 && text.includes("://");
				if (!pendingWhitespace && !mayLinkify && !text.includes("\n")) {
					isAfterBlockTag = false;
					return;
				}

				let content = pendingWhitespace + text;
				pendingWhitespace = "";
				if (preDepth === 0) {
					if (isAfterBlockTag) {
						content = content.replace(LEADING_NEWLINE_REGEX, "");
					}
					pendingWhitespace = TRAILING_NEWLINE_REGEX.exec(content)?.[0] ?? "";
					content = content.slice(0, content.length - pendingWhitespace.length);
				}
				if (content) isAfterBlockTag = false;

				chunk.replace(mayLinkify ? linkifyBareUrls(content) : content, {
					html: true,
				});
			},
		})
		.transform(html);

	return result.replace(BLOCK_TAGS_ONLY_PARAGRAPH_REGEX, "$1");
}

/**
 * Filters an HTML element authored inside user markdown down to the allowlist, in place.
 * Returns `false` when the element itself may not render; the caller should then render only its children.
 */
function sanitizeElement(element: HTMLRewriterTypes.Element) {
	const tagName = element.tagName;
	if (!Object.hasOwn(ALLOWED_ELEMENTS, tagName)) return false;
	const allowedAttributes = ALLOWED_ELEMENTS[tagName];
	if (tagName === "input" && element.getAttribute("type") !== "checkbox") {
		return false;
	}

	for (const [name, value] of [...element.attributes]) {
		const normalizedName = normalizeAttributeName(name);
		const isAllowed =
			(GLOBAL_ATTRIBUTES.has(normalizedName) ||
				allowedAttributes.has(normalizedName)) &&
			!(normalizedName === "class" && !value) &&
			!(URL_ATTRIBUTES.has(normalizedName) && !isSafeUrl(value));

		if (!isAllowed) {
			element.removeAttribute(name);
		} else if (normalizedName === "style") {
			element.setAttribute(name, value.replace(CSS_URL_REGEX, ""));
		}
	}

	if (tagName === "img") {
		element.setAttribute("referrerpolicy", "no-referrer");
	}
	if (tagName === "a" && element.hasAttribute("target")) {
		element.setAttribute("rel", NEW_TAB_LINK_REL);
	}

	return true;
}

function isSafeUrl(url: string) {
	const decoded = decodeHtmlEntities(url);
	if (UNSAFE_URL_REGEX.test(decoded)) return false;

	try {
		return !UNSAFE_URL_REGEX.test(
			decodeURIComponent(decoded).replace(/[^A-Za-z0-9/:]/g, ""),
		);
	} catch {
		return false;
	}
}

/** HTMLRewriter hands over attribute values as written, `&#106;avascript:` must not slip past the check */
function decodeHtmlEntities(value: string) {
	return value
		.replace(/&#x([0-9a-f]+);?/gi, (_, hex) =>
			String.fromCodePoint(Number.parseInt(hex, 16)),
		)
		.replace(/&#(\d+);?/g, (_, decimal) =>
			String.fromCodePoint(Number(decimal)),
		)
		.replace(
			/&(colon|tab|newline);/gi,
			(_, name: string) =>
				({ colon: ":", tab: "\t", newline: "\n" })[name.toLowerCase()] ?? "",
		);
}

function linkifyBareUrls(text: string) {
	return text.replace(BARE_URL_REGEX, (match) => {
		const url = match.replace(URL_TRAILING_PUNCTUATION_REGEX, "");
		return `<a href="${url}">${url}</a>${match.slice(url.length)}`;
	});
}

function attributeSet(...names: string[]) {
	return new Set(names);
}

/** `stop-color` and `stopColor` both become `stopcolor` so the allowlist is spelled once */
function normalizeAttributeName(name: string) {
	return name.toLowerCase().replaceAll("-", "");
}
