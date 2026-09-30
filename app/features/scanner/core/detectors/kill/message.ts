/**
 * Kill-feed row text → splatted name. A row reads as one line ("Splatted
 * nwrm!"); the language template whose constant text fits the line's head
 * and tail best wins, and whatever sits between is the name. Characters are
 * folded (case, diacritics) one-to-one so the cut points map back onto the
 * original read; spaces only drop out inside the comparisons, since OCR word
 * gaps wobble.
 */
import { editDistance } from "../../text";
import {
	KILL_MESSAGE_TEMPLATES,
	type KillMessageTemplate,
} from "./localized-messages";

export interface KillMessageMatch {
	template: KillMessageTemplate;
	/** 0..1 fit of the constant text, pre and post weighted by their length */
	score: number;
	/** what the constant parts leave over; null when nothing does */
	name: string | null;
}

/** A cut may land this many characters off the constant text's length (dropped/doubled glyphs). */
const CUT_SLACK = 2;

/**
 * Handicap of a cut inside a word where the constant text meets the name at a
 * space: more than one glyph's share of the shortest such constant text
 * (をたおした, 1/6), so a gap-aligned cut off by one glyph still wins.
 */
const WORD_SPLIT_PENALTY = 0.2;

/** At feed size the row's "!" reads as any of these; the tail comparison treats them as one. */
const EXCLAMATION_LOOKALIKES = new Set([
	"!",
	"|",
	"l",
	"i",
	"1",
	"「",
	"¡",
	"！",
]);

/** The best-fitting template for a row read; null only when no template has constant text. */
export function matchKillMessage(
	read: string,
	templates: readonly KillMessageTemplate[] = KILL_MESSAGE_TEMPLATES,
): KillMessageMatch | null {
	const chars = [...read];
	const folded = chars.map(foldChar);
	let best: KillMessageMatch | null = null;
	for (const template of templates) {
		const pre = foldConstant(template.pre);
		const post = foldConstant(template.post);
		if (pre.length + post.length === 0) continue;
		const head = bestCut(folded, pre, "head", template.pre.endsWith(" "));
		const tail = bestCut(folded, post, "tail", template.post.startsWith(" "));
		if (head.length + tail.length > chars.length) continue;
		const score =
			(head.score * pre.length + tail.score * post.length) /
			(pre.length + post.length);
		if (best && score <= best.score) continue;
		const name = chars
			.slice(head.length, chars.length - tail.length)
			.join("")
			.trim();
		best = { template, score, name: name.length > 0 ? name : null };
	}
	return best;
}

function foldChar(ch: string): string {
	const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
	return (base.length > 0 ? base : ch).toLowerCase()[0]!;
}

function foldConstant(text: string): string[] {
	return [...text].filter((ch) => ch !== " ").map(foldChar);
}

function foldExclamations(chars: readonly string[]): string {
	return chars
		.map((ch) => (EXCLAMATION_LOOKALIKES.has(ch) ? "!" : ch))
		.join("");
}

/**
 * How many characters of the read's head or tail the constant text covers:
 * every length within CUT_SLACK of the constant's is scored (spaces
 * excluded), the best fit wins, ties go to the length nearest the constant's.
 * Where the constant text meets the name at a space, a cut inside a word is
 * handicapped (WORD_SPLIT_PENALTY): "Splatte datkid" must lose the 'd' of
 * its constant, not the first letter of the name. Nothing is cut when nothing
 * fits at all — better a name with a stray character than one missing its last.
 */
function bestCut(
	folded: readonly string[],
	constant: readonly string[],
	side: "head" | "tail",
	gapped: boolean,
): { length: number; score: number } {
	if (constant.length === 0) return { length: 0, score: 1 };
	const target =
		side === "tail" ? foldExclamations(constant) : constant.join("");
	let best = { length: 0, score: 0, adjusted: 0 };
	const min = Math.max(0, constant.length - CUT_SLACK);
	const max = Math.min(folded.length, constant.length + CUT_SLACK);
	for (let length = min; length <= max; length++) {
		const cut = side === "head" ? length : folded.length - length;
		const segment = (
			side === "head" ? folded.slice(0, cut) : folded.slice(cut)
		).filter((ch) => ch !== " ");
		const text = side === "tail" ? foldExclamations(segment) : segment.join("");
		const score =
			1 - editDistance(text, target) / Math.max(text.length, target.length, 1);
		const atWordGap =
			cut === 0 ||
			cut === folded.length ||
			folded[cut] === " " ||
			folded[cut - 1] === " ";
		const adjusted = gapped && !atWordGap ? score - WORD_SPLIT_PENALTY : score;
		const closer =
			adjusted === best.adjusted &&
			Math.abs(length - constant.length) <
				Math.abs(best.length - constant.length);
		if (adjusted > best.adjusted || closer) best = { length, score, adjusted };
	}
	return best.score > 0
		? { length: best.length, score: best.score }
		: { length: 0, score: 0 };
}
