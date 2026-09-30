const GLOBAL_ATTRIBUTES = attributes(
	"align",
	"classname",
	"dir",
	"height",
	"style",
	"title",
	"width",
);

const HEADING_ATTRIBUTES = attributes("id");

const TABLE_CELL_ATTRIBUTES = attributes("colspan", "rowspan", "valign");

const SVG_PRESENTATION_ATTRIBUTES = attributes(
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

const SVG_GRADIENT_ATTRIBUTES = attributes(
	"id",
	"gradientunits",
	"gradienttransform",
	"spreadmethod",
	...SVG_PRESENTATION_ATTRIBUTES,
);

/** Elements user markdown may render, mapped to the attributes allowed on them (lower-cased, hyphens removed) in addition to {@link GLOBAL_ATTRIBUTES}. Anything else is unwrapped so only its text content survives. */
const ALLOWED_ELEMENTS: Record<string, ReadonlySet<string>> = {
	a: attributes("href", "target"),
	abbr: attributes(),
	b: attributes(),
	blockquote: attributes(),
	br: attributes(),
	center: attributes(),
	code: attributes(),
	dd: attributes(),
	del: attributes(),
	details: attributes("open"),
	div: attributes(),
	dl: attributes(),
	dt: attributes(),
	em: attributes(),
	figcaption: attributes(),
	figure: attributes(),
	font: attributes("color", "face", "size"),
	h1: HEADING_ATTRIBUTES,
	h2: HEADING_ATTRIBUTES,
	h3: HEADING_ATTRIBUTES,
	h4: HEADING_ATTRIBUTES,
	h5: HEADING_ATTRIBUTES,
	h6: HEADING_ATTRIBUTES,
	hr: attributes(),
	i: attributes(),
	img: attributes("src", "alt", "loading", "border"),
	input: attributes("type", "checked", "readonly", "disabled"),
	ins: attributes(),
	kbd: attributes(),
	li: attributes("value"),
	mark: attributes(),
	ol: attributes("start", "type", "reversed"),
	p: attributes(),
	picture: attributes(),
	pre: attributes(),
	s: attributes(),
	small: attributes(),
	source: attributes("src", "srcset", "type", "media"),
	span: attributes(),
	strike: attributes(),
	strong: attributes(),
	sub: attributes(),
	summary: attributes(),
	sup: attributes(),
	table: attributes("border", "cellpadding", "cellspacing"),
	tbody: attributes(),
	td: TABLE_CELL_ATTRIBUTES,
	tfoot: attributes(),
	th: attributes("scope", ...TABLE_CELL_ATTRIBUTES),
	thead: attributes(),
	tr: attributes("valign"),
	u: attributes(),
	ul: attributes("start"),
	video: attributes(
		"src",
		"poster",
		"controls",
		"autoplay",
		"loop",
		"muted",
		"playsinline",
		"preload",
	),
	svg: attributes(
		"xmlns",
		"viewbox",
		"preserveaspectratio",
		...SVG_PRESENTATION_ATTRIBUTES,
	),
	g: SVG_PRESENTATION_ATTRIBUTES,
	defs: attributes(),
	path: attributes("d", ...SVG_PRESENTATION_ATTRIBUTES),
	rect: attributes("x", "y", "rx", "ry", ...SVG_PRESENTATION_ATTRIBUTES),
	circle: attributes("cx", "cy", "r", ...SVG_PRESENTATION_ATTRIBUTES),
	ellipse: attributes("cx", "cy", "rx", "ry", ...SVG_PRESENTATION_ATTRIBUTES),
	line: attributes("x1", "y1", "x2", "y2", ...SVG_PRESENTATION_ATTRIBUTES),
	polyline: attributes("points", ...SVG_PRESENTATION_ATTRIBUTES),
	polygon: attributes("points", ...SVG_PRESENTATION_ATTRIBUTES),
	text: attributes(
		"x",
		"y",
		"dx",
		"dy",
		"textanchor",
		"fontsize",
		...SVG_PRESENTATION_ATTRIBUTES,
	),
	lineargradient: attributes(
		"x1",
		"y1",
		"x2",
		"y2",
		...SVG_GRADIENT_ATTRIBUTES,
	),
	radialgradient: attributes(
		"cx",
		"cy",
		"r",
		"fx",
		"fy",
		...SVG_GRADIENT_ATTRIBUTES,
	),
	stop: attributes("offset", "stopcolor", "stopopacity"),
	animatetransform: attributes(
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

const VOID_ELEMENTS = new Set(["br", "hr", "img", "input", "source"]);

const NEW_TAB_LINK_REL = "noopener noreferrer";

export interface SanitizedElement {
	tag: string;
	props: Record<string, unknown>;
	/** Void elements must be created without children or React warns */
	isVoid: boolean;
}

/**
 * Filters an HTML element authored inside user markdown down to the allowlist.
 * Returns `null` when the element itself may not render; the caller should then render only its children.
 *
 * @example
 * MarkdownHtml.sanitizeElement("img", { src: "a.png", onerror: "x()" })
 * // -> { tag: "img", props: { src: "a.png", referrerPolicy: "no-referrer" }, isVoid: true }
 * MarkdownHtml.sanitizeElement("a", { href: "https://x", target: "_blank", rel: "opener" })
 * // -> { tag: "a", props: { href: "https://x", target: "_blank", rel: "noopener noreferrer" }, isVoid: false }
 * MarkdownHtml.sanitizeElement("meta", { httpEquiv: "refresh" })
 * // -> null
 */
export function sanitizeElement(
	tag: string,
	props: Record<string, unknown>,
): SanitizedElement | null {
	const tagName = tag.toLowerCase();
	if (!Object.hasOwn(ALLOWED_ELEMENTS, tagName)) return null;
	const allowedAttributes = ALLOWED_ELEMENTS[tagName];
	if (tagName === "input" && props.type !== "checkbox") return null;

	const sanitizedProps: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(props)) {
		if (key === "key") {
			sanitizedProps.key = value;
			continue;
		}

		const normalizedKey = normalizeAttributeName(key);
		if (normalizedKey === "classname" && !value) continue;
		if (
			GLOBAL_ATTRIBUTES.has(normalizedKey) ||
			allowedAttributes.has(normalizedKey)
		) {
			sanitizedProps[key] = value;
		}
	}

	if (tagName === "img") {
		sanitizedProps.referrerPolicy = "no-referrer";
	}
	if (tagName === "a" && sanitizedProps.target) {
		sanitizedProps.rel = NEW_TAB_LINK_REL;
	}

	return { tag, props: sanitizedProps, isVoid: VOID_ELEMENTS.has(tagName) };
}

function attributes(...names: string[]) {
	return new Set(names);
}

/** `className`, `class-name` and `CLASSNAME` all become `classname` so the allowlist is spelled once */
function normalizeAttributeName(name: string) {
	return name.toLowerCase().replaceAll("-", "");
}
