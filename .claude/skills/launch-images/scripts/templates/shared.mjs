/** Styles every template gets: the canvas, OG blobs, wordmark and bold text. */
export const BASE_CSS = `
body { margin: 0 !important; background: #000; display: block !important; }
.cv {
	--text-soft: color-mix(in oklab, var(--color-text) 72%, var(--color-text-high));
	position: relative; flex: none; overflow: hidden;
	background-color: var(--color-bg); color: var(--color-text);
}
.blob { position: absolute; border-radius: 58% 42% 55% 45% / 48% 60% 40% 52%; }
.wordmark { font-size: 22px; font-weight: var(--weight-extra); letter-spacing: 0.22em; text-transform: uppercase; color: var(--text-soft); white-space: nowrap; }
strong { color: var(--color-text); font-weight: var(--weight-extra); }
`;

export function boldMarkdown(text) {
	return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function stripBold(text) {
	return text.replaceAll("**", "");
}

export function stripHtml(text) {
	return text.replace(/&#8209;/g, "-").replace(/<[^>]+>/g, "");
}
