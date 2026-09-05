/** Player name recognition: glyph matching over the name ROI. */
import { getCV, type Mat } from "../../cv";
import {
	type GlyphSet,
	type RecognizedChar,
	type RecognizedText,
	recognizeText,
} from "../../glyphs";

export interface ParsedName {
	name: string;
	/** min glyph score; 0 when ink was present but nothing recognized */
	confidence: number;
	raw: RecognizedText;
}

/**
 * BlitzMain renders 'I', 'l', '|', '1' as near-identical bars, so context
 * decides: next to lowercase 'l' ("Olise"), digit '1' ("Jrod_14"), uppercase
 * 'I' ("SHIP"), off an underscore '1' ("gori_1"), else 'l'. Misses "McIntosh",
 * but so would a human reading the pixels.
 */
const BAR_CHARS = new Set(["I", "l", "|", "1"]);

function normalizeBars(name: string): string {
	const chars = [...name];
	// context is the nearest NON-BAR char within the word ("ll" in "Chill" must
	// resolve from the same neighbor); underscores bound words like spaces
	const neighbor = (i: number, step: -1 | 1): string | undefined => {
		for (let j = i + step; j >= 0 && j < chars.length; j += step) {
			const c = chars[j]!;
			if (c === " " || c === "_") return undefined;
			if (!BAR_CHARS.has(c)) return c;
		}
		return undefined;
	};
	const test = (re: RegExp) => (c: string | undefined) =>
		c !== undefined && re.test(c);
	const isLower = test(/\p{Ll}/u);
	const isDigit = test(/\d/);
	const isUpper = test(/\p{Lu}/u);
	return chars
		.map((c, i) => {
			if (!BAR_CHARS.has(c)) return c;
			const left = neighbor(i, -1);
			const right = neighbor(i, 1);
			if (isLower(left) || isLower(right)) return "l";
			if (isDigit(left) || isDigit(right)) return "1";
			if (isUpper(left) || isUpper(right)) return "I";
			if (chars[i - 1] === "_" || chars[i + 1] === "_") return "1";
			return "l";
		})
		.join("");
}

/**
 * Kana 'ー' and hyphen '-' are homoglyphs under capture blur ("ドラグ-ン"):
 * a kana neighbor reads 'ー', a Latin/digit neighbor '-', else the raw pick stands.
 */
const LONG_BAR_CHARS = new Set(["-", "ー"]);

function normalizeLongBars(name: string): string {
	const chars = [...name];
	const neighbor = (i: number, step: -1 | 1): string | undefined => {
		for (let j = i + step; j >= 0 && j < chars.length; j += step) {
			const c = chars[j]!;
			if (c === " " || c === "_") return undefined;
			if (!LONG_BAR_CHARS.has(c)) return c;
		}
		return undefined;
	};
	const test = (re: RegExp) => (c: string | undefined) =>
		c !== undefined && re.test(c);
	const isKana = test(/[ぁ-ヾ]/u);
	const isLatinOrDigit = test(/[a-zA-Z0-9]/);
	return chars
		.map((c, i) => {
			if (!LONG_BAR_CHARS.has(c)) return c;
			const left = neighbor(i, -1);
			const right = neighbor(i, 1);
			if (isKana(left) || isKana(right)) return "ー";
			if (isLatinOrDigit(left) || isLatinOrDigit(right)) return "-";
			return c;
		})
		.join("");
}

/**
 * BlitzMain's 'O' and '0' are the same box at capture fidelity: a digit neighbor
 * keeps '0', uppercase reads 'O' ("AHOO"), after lowercase '0' ("y0s"),
 * word-initial before lowercase 'O' ("Olise").
 */
function normalizeOhs(name: string): string {
	const chars = [...name];
	const ambiguous = (c: string | undefined) => c === "O" || c === "0";
	const neighbor = (i: number, step: -1 | 1): string | undefined => {
		for (let j = i + step; j >= 0 && j < chars.length; j += step) {
			const c = chars[j]!;
			if (c === " ") return undefined;
			if (!ambiguous(c)) return c;
		}
		return undefined;
	};
	const test = (re: RegExp) => (c: string | undefined) =>
		c !== undefined && re.test(c);
	const isDigit = test(/\d/);
	const isUpper = test(/\p{Lu}/u);
	const isLower = test(/\p{Ll}/u);
	return chars
		.map((c, i) => {
			if (!ambiguous(c)) return c;
			const left = neighbor(i, -1);
			const right = neighbor(i, 1);
			if (isDigit(left) || isDigit(right)) return "0";
			if (isUpper(left) || isUpper(right)) return "O";
			if (isLower(left)) return "0";
			if (isLower(right)) return "O";
			return c;
		})
		.join("");
}

/**
 * '.', '・', '·' tight-crop to near-identical blobs. A dot floating well above
 * the baseline cannot be '.', so it rereads as the best middle-dot candidate;
 * the reverse does not hold (BlitzMain draws '・' ON the baseline in some names,
 * scoreboard/robot row 5), so baseline dots keep the template ranking.
 */
const DOT_CHARS = new Set([".", "・", "·"]);
const DOT_BASELINE_SLACK_PX = 3;

function fixRaisedDots(raw: RecognizedText): RecognizedText {
	if (!raw.chars.some((c) => c.char === ".")) return raw;
	const anchors = raw.chars
		.filter((c) => !DOT_CHARS.has(c.char))
		.map((c) => c.y1)
		.sort((a, b) => a - b);
	if (anchors.length === 0) return raw;
	const baseline = anchors[Math.floor(anchors.length / 2)]!;
	const chars = raw.chars.map((c) => {
		if (c.char !== "." || baseline - c.y1 <= DOT_BASELINE_SLACK_PX) return c;
		const alt = c.candidates?.find(
			(k) => DOT_CHARS.has(k.char) && k.char !== ".",
		);
		return { ...c, char: alt?.char ?? "・" };
	});
	let ci = 0;
	const text = [...raw.text]
		.map((ch) => (ch === " " ? ch : chars[ci++]!.char))
		.join("");
	return { ...raw, text, chars };
}

/**
 * On soft captures 'b' vs 'h' comes down to the bowl floor, which correlation
 * weighs too lightly (font 'h' beats fixture 'b' by ~0.003 on a true 'b'). The
 * bottom band between the stems is solid in a 'b', empty in an 'h' (0.90 vs
 * 0.15). Only near-ties are re-decided, and only above ~20px ink height: blur
 * closes a true 'h' below that (15px 'h' measured 0.67).
 */
const BH_TWINS: Record<string, string> = { b: "h", h: "b" };
const BH_SCORE_MARGIN = 0.08;
const BH_INK_THRESHOLD = 150;
const BH_BOWL_MIN_FRACTION = 0.5;
const BH_MIN_INK_HEIGHT_PX = 20;

function resolveBhByBowlFloor(
	raw: RecognizedText,
	grayView: Mat,
): RecognizedText {
	const contested = (c: RecognizedChar) => {
		const twin = BH_TWINS[c.char];
		if (!twin || c.y1 - c.y0 < BH_MIN_INK_HEIGHT_PX) return false;
		return (
			c.candidates?.some(
				(k) => k.char === twin && c.score - k.score <= BH_SCORE_MARGIN,
			) ?? false
		);
	};
	if (!raw.chars.some(contested)) return raw;

	// the crop is an ROI view, so copy before pixel access
	const gray = new (getCV().Mat)();
	grayView.copyTo(gray);
	const { cols, data } = gray;
	const chars = raw.chars.map((c) => {
		if (!contested(c)) return c;
		const w = c.x1 - c.x0;
		const h = c.y1 - c.y0;
		const cx0 = c.x0 + Math.round(w * 0.3);
		const cx1 = c.x1 - Math.round(w * 0.3);
		const by0 = c.y1 - Math.max(2, Math.round(h * 0.18));
		let ink = 0;
		let total = 0;
		for (let y = by0; y < c.y1; y++) {
			for (let x = cx0; x < cx1; x++) {
				total++;
				if (data[y * cols + x]! > BH_INK_THRESHOLD) ink++;
			}
		}
		const bowlClosed = total > 0 && ink / total >= BH_BOWL_MIN_FRACTION;
		return { ...c, char: bowlClosed ? "b" : "h" };
	});
	gray.delete();
	let ci = 0;
	const text = [...raw.text]
		.map((ch) => (ch === " " ? ch : chars[ci++]!.char))
		.join("");
	return { ...raw, text, chars };
}

/**
 * 'P' and 'p' tight-crop to the same shape, but the segment keeps the position
 * the templates lose: 'p' hangs below the baseline (median ink bottom of the
 * non-twin glyphs, which shrugs off real descenders). Skipped with no anchor glyph.
 */
const DESCENDER_TWINS: Record<string, [upper: string, lower: string]> = {
	P: ["P", "p"],
	p: ["P", "p"],
};
const DESCENT_MIN_PX = 3;

function resolveCaseByDescent(raw: RecognizedText): string {
	if (!raw.chars.some((c) => c.char in DESCENDER_TWINS)) return raw.text;
	const anchors = raw.chars
		.filter((c) => !(c.char in DESCENDER_TWINS))
		.map((c) => c.y1)
		.sort((a, b) => a - b);
	if (anchors.length === 0) return raw.text;
	const baseline = anchors[Math.floor(anchors.length / 2)]!;
	let ci = 0;
	return [...raw.text]
		.map((ch) => {
			if (ch === " ") return ch;
			const rc: RecognizedChar = raw.chars[ci++]!;
			const twin = DESCENDER_TWINS[rc.char];
			if (!twin) return rc.char;
			return rc.y1 - baseline >= DESCENT_MIN_PX ? twin[1] : twin[0];
		})
		.join("");
}

export function parseName(
	gray: Mat,
	glyphs: GlyphSet,
	options: { spaceGap?: number; binThreshold?: number } = {},
): ParsedName {
	const raw = recognizeText(gray, glyphs, {
		spaceGap: options.spaceGap ?? 7,
		binThreshold: options.binThreshold,
		minCharScore: 0.35,
	});
	return {
		name: normalizeLongBars(
			normalizeOhs(
				normalizeBars(
					resolveCaseByDescent(
						resolveBhByBowlFloor(fixRaisedDots(raw), gray),
					).trim(),
				),
			),
		),
		confidence: raw.confidence,
		raw,
	};
}
