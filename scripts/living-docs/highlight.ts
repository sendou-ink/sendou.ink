const TOKEN_REGEX =
	/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\[\s\S]|[^\\`])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([\s\S])/g;

const KEYWORDS = new Set([
	"as",
	"async",
	"await",
	"break",
	"case",
	"catch",
	"class",
	"const",
	"continue",
	"default",
	"do",
	"else",
	"export",
	"extends",
	"for",
	"from",
	"function",
	"if",
	"implements",
	"import",
	"in",
	"instanceof",
	"interface",
	"keyof",
	"let",
	"new",
	"of",
	"private",
	"readonly",
	"return",
	"satisfies",
	"static",
	"switch",
	"throw",
	"try",
	"type",
	"typeof",
	"var",
	"while",
	"yield",
]);

const LITERALS = new Set(["true", "false", "null", "undefined", "this"]);

const PRIMITIVE_TYPES = new Set([
	"string",
	"number",
	"boolean",
	"void",
	"unknown",
	"never",
	"any",
	"object",
	"bigint",
]);

/** TypeScript source as HTML with token classes for the code block styles. */
export function highlight(code: string) {
	let html = "";

	for (const match of code.matchAll(TOKEN_REGEX)) {
		const [token, comment, string, number, identifier] = match;
		const end = (match.index ?? 0) + token.length;

		if (comment) html += wrap("c", token);
		else if (string) html += wrap("s", token);
		else if (number) html += wrap("n", token);
		else if (identifier) {
			html += wrap(identifierClass(identifier, code, end), token);
		} else html += escapeHtml(token);
	}

	return html;
}

export function escapeHtml(text: string) {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

/** Removes the indentation shared by every line, `firstLineIndent` being what the first line lost to slicing. */
export function dedent(code: string, firstLineIndent = "") {
	const lines = `${firstLineIndent}${code}`.split("\n");
	const indents = lines
		.filter((line) => line.trim() !== "")
		.map((line) => line.match(/^[\t ]*/)?.[0].length ?? 0);
	const shared = Math.min(...indents);

	return lines.map((line) => line.slice(shared)).join("\n");
}

function identifierClass(identifier: string, code: string, end: number) {
	if (KEYWORDS.has(identifier)) return "k";
	if (LITERALS.has(identifier)) return "l";
	if (PRIMITIVE_TYPES.has(identifier)) return "t";
	if (/^[A-Z]/.test(identifier)) return "t";
	if (/^\s*(<[^>]*>)?\(/.test(code.slice(end, end + 40))) return "f";

	return null;
}

function wrap(className: string | null, token: string) {
	if (!className) return escapeHtml(token);

	return `<span class="${className}">${escapeHtml(token)}</span>`;
}
