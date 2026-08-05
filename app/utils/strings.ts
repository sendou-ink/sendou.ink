import type { GearType } from "~/modules/in-game-lists/types";
import { assertUnreachable } from "./types";

export function inGameNameWithoutDiscriminator(inGameName: string) {
	return inGameName.split("#")[0];
}

export const rawSensToString = (sens: number) =>
	`${sens > 0 ? "+" : ""}${sens / 10}`;

type WithStart<
	S extends string,
	Start extends string,
> = S extends `${Start}${infer Rest}` ? `${Start}${Rest}` : never;

export function startsWith<S extends string, Start extends string>(
	str: S,
	start: Start,
	// @ts-expect-error TS 4.9 upgrade
): str is WithStart<S, Start> {
	return str.startsWith(start);
}

type Split<S extends string, Sep extends string> = string extends S
	? string[]
	: S extends ""
		? []
		: S extends `${infer T}${Sep}${infer U}`
			? [T, ...Split<U, Sep>]
			: [S];

export function split<S extends string, Sep extends string>(
	str: S,
	seperator: Sep,
) {
	return str.split(seperator) as Split<S, Sep>;
}

export function gearTypeToInitial(gearType: GearType) {
	switch (gearType) {
		case "HEAD":
			return "H";
		case "CLOTHES":
			return "C";
		case "SHOES":
			return "S";
		default:
			assertUnreachable(gearType);
	}
}

export function pathnameFromPotentialURL(maybeUrl: string) {
	const parsed = safeParseUrl(maybeUrl);
	if (parsed) return stripEdgeSlashes(parsed.pathname);

	// handle a URL pasted without a protocol, e.g. "discord.gg/FW4dKrY"
	const parsedWithProtocol = safeParseUrl(`https://${maybeUrl}`);
	const pathname = parsedWithProtocol
		? stripEdgeSlashes(parsedWithProtocol.pathname)
		: "";

	return pathname || maybeUrl;
}

function safeParseUrl(value: string) {
	try {
		return new URL(value);
	} catch {
		return null;
	}
}

function stripEdgeSlashes(pathname: string) {
	return pathname.replace(/^\/+|\/+$/g, "");
}

export function truncateBySentence(value: string, max: number) {
	if (value.length <= max) {
		return value;
	}

	// a sentence only ends at a terminator followed by whitespace, so that
	// e.g. "18.00" does not split in the middle
	const sentences = value.match(/[\s\S]+?(?:[.!?](?=\s|$)|\n|$)/g) || [];
	let result = "";

	for (const sentence of sentences) {
		if ((result + sentence).length > max) {
			break;
		}
		result += sentence;
	}

	// when cutting at a sentence boundary would leave most of the budget
	// unused, a mid-sentence cut that fills it is more informative
	if (result.length < max / 2) {
		return value.slice(0, max).trim();
	}

	return result.trim();
}

// based on https://github.com/zuchka/remove-markdown
const NAMED_HTML_ENTITIES: Record<string, string> = {
	nbsp: " ",
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
};

export function removeMarkdown(value: string) {
	const htmlReplaceRegex = /<[^>]*>/g;
	return (
		value
			// Remove HTML tags
			.replace(htmlReplaceRegex, "")
			// Decode named HTML entities (e.g. &nbsp;, &amp;)
			.replace(/&([a-zA-Z]+);/g, (match, name: string) => {
				const replacement = NAMED_HTML_ENTITIES[name.toLowerCase()];
				return replacement ?? match;
			})
			// Decode numeric HTML entities (e.g. &#160; or &#xA0;)
			.replace(/&#(x?[0-9a-fA-F]+);/g, (_, code: string) => {
				const codePoint = code.startsWith("x")
					? Number.parseInt(code.slice(1), 16)
					: Number.parseInt(code, 10);
				const isValidCodePoint =
					Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff;
				return isValidCodePoint ? String.fromCodePoint(codePoint) : "";
			})
			// Remove setext-style headers
			.replace(/^[=-]{2,}\s*$/g, "")
			// Remove footnotes?
			.replace(/\[\^.+?\](: .*?$)?/g, "")
			.replace(/\s{0,2}\[.*?\]: .*?$/g, "")
			// Remove images
			.replace(/!\[(.*?)\][[(].*?[\])]/g, "")
			// Remove inline links
			.replace(/\[([^\]]*?)\][[(].*?[\])]/g, "$1")
			// Remove blockquotes
			.replace(/^(\n)?\s{0,3}>\s?/gm, "$1")
			// Remove reference-style links?
			.replace(/^\s{1,2}\[(.*?)\]: (\S+)( ".*?")?\s*$/g, "")
			// Remove headers
			.replace(/^\s{0,3}#{1,6}\s*/gm, "")
			// Remove * emphasis
			.replace(/(\*+)([^\s*])(.*?[^\s*])??\1/g, "$2$3")
			// Remove _ emphasis. Unlike *, _ emphasis gets rendered only if
			//   1. Either there is a whitespace character before opening _ and after closing _.
			//   2. Or _ is at the start/end of the string.
			.replace(/(^|\W)([_]+)(\S)(.*?\S)??\2($|\W)/g, "$1$3$4$5")
			// Remove code blocks
			.replace(/(`{3,})(.*?)\1/gm, "$2")
			// Remove inline code
			.replace(/`(.+?)`/g, "$1")
			// // Replace two or more newlines with exactly two? Not entirely sure this belongs here...
			// .replace(/\n{2,}/g, '\n\n')
			// // Remove newlines in a paragraph
			// .replace(/(\S+)\n\s*(\S+)/g, '$1 $2')
			// Replace strike through
			.replace(/~(.*?)~/g, "$1")
			// Collapse runs of whitespace (e.g. from decoded &nbsp; or stripped tags)
			.replace(/[ \t ]{2,}/g, " ")
			.trim()
	);
}
