import type { GearType } from "~/db/types";
import { assertUnreachable } from "./types";

export function inGameNameWithoutDiscriminator(inGameName: string) {
	return inGameName.split("#")[0];
}

export function semiRandomId() {
	return String(Math.random());
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

export function capitalize(str: string) {
	return str[0].toUpperCase() + str.slice(1);
}

export function pathnameFromPotentialURL(maybeUrl: string) {
	try {
		return new URL(maybeUrl).pathname.replace("/", "");
	} catch {
		return maybeUrl;
	}
}

export function truncateBySentence(value: string, max: number) {
	if (value.length <= max) {
		return value;
	}

	const sentences = value.match(/[^.!?\n]+[.!?\n]*/g) || [];
	let result = "";

	for (const sentence of sentences) {
		if ((result + sentence).length > max) {
			break;
		}
		result += sentence;
	}

	return result.length > 0 ? result.trim() : value.slice(0, max).trim();
}

// based on https://github.com/zuchka/remove-markdown
export function removeMarkdown(value: string) {
	const htmlReplaceRegex = /<[^>]*>/g;
	return (
		value
			// Remove HTML tags
			.replace(htmlReplaceRegex, "")
			// Remove setext-style headers
			.replace(/^[=\-]{2,}\s*$/g, "")
			// Remove footnotes?
			.replace(/\[\^.+?\](\: .*?$)?/g, "")
			.replace(/\s{0,2}\[.*?\]: .*?$/g, "")
			// Remove images
			.replace(/\!\[(.*?)\][\[\(].*?[\]\)]/g, "")
			// Remove inline links
			.replace(/\[([^\]]*?)\][\[\(].*?[\]\)]/g, "$2")
			// Remove blockquotes
			.replace(/^(\n)?\s{0,3}>\s?/gm, "$1")
			// Remove reference-style links?
			.replace(/^\s{1,2}\[(.*?)\]: (\S+)( ".*?")?\s*$/g, "")
			// Remove headers
			.replaceAll("#", "")
			// Remove * emphasis
			.replace(/([\*]+)(\S)(.*?\S)??\1/g, "$2$3")
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
	);
}
