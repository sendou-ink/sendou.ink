/**
 * Player name recognition: glyph matching over the name ROI.
 */
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
 * BlitzMain renders 'I', 'l', '|', and '1' as near-identical bars — no pixel
 * evidence separates them, so fall back to context, by decreasing weight of
 * evidence: a bar next to a lowercase letter is overwhelmingly an 'l' in
 * latin names ("Olise"), next to a digit it's a '1' ("Jrod_14"), next to an
 * uppercase letter it's an 'I' ("SHIP"), a bare bar hanging off an
 * underscore is a numbered-alt suffix ("gori_1"), and with no latin/digit
 * context at all (kana, symbols, edges) 'l' is the common case in the wild.
 * (This will genuinely miss e.g. "McIntosh", but so would a human reading
 * the pixels.)
 */
const BAR_CHARS = new Set(["I", "l", "|", "1"]);

function normalizeBars(name: string): string {
	const chars = [...name];
	// Context is the nearest NON-BAR char within the word: consecutive bars
	// ("ll" in "Chill") must all resolve from the same real-letter neighbor,
	// not from each other's arbitrary raw reading. Underscores bound words
	// like spaces do — "gori_1"'s lowercase must not leak across the
	// separator onto the suffix.
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
 * The kana long-vowel bar 'ー' and the ASCII hyphen '-' are horizontal-bar
 * homoglyphs the same way the vertical bars are: both are a single
 * horizontal stroke whose length difference drowns in capture blur, so
 * which template wins is noise ("ドラグ-ン"). Resolve by script context —
 * a kana neighbor reads 'ー', a Latin/digit neighbor reads '-', and with
 * no context the raw pick stands.
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
 * BlitzMain's 'O' and '0' are the same rounded box at capture fidelity —
 * which template wins is noise — so, like the bars, resolve by context via
 * the nearest unambiguous neighbor in the word: a digit neighbor keeps '0',
 * an uppercase neighbor reads 'O' ("AHOO"), after a lowercase letter it's a
 * stylized digit ("y0s"), and word-initial before lowercase it's a
 * capitalized name ("Olise").
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
 * The round dots '.', '・', and '·' tight-crop to near-identical blobs, so
 * which template wins is noise. Vertical position decides in one direction
 * only: a period sits on the baseline, so a dot floating well above it
 * cannot be '.' — reread it as the best-scoring middle-dot candidate. The
 * reverse does not hold: BlitzMain draws '・' ON the baseline in some names
 * (scoreboard/robot row 5, "..・"), so baseline dots stay with the template
 * ranking, where the exact fixture crops separate the sizes.
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
 * On soft captures BlitzMain's 'b' and 'h' come down to whether the bowl
 * closes at the bottom, and template correlation weighs that stroke too
 * lightly to be trusted (a font 'h' beats a fixture 'b' by ~0.003 on a true
 * 'b'). The segment's own pixels decide: the bottom band between the stems
 * is solid ink in a 'b' (the bowl floor) and empty in an 'h' (open legs) —
 * measured 0.90 vs 0.15 across fixtures. Only near-tied twin reads are
 * re-decided; confident reads keep the template pick. Small text is exempt:
 * below ~20px of ink height the blur closes a true 'h' too (a 15px 'h'
 * measured 0.67), so the pixels only outrank the templates at row scale.
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
 * BlitzMain's 'P' and 'p' tight-crop to the same stem-and-bowl shape, so the
 * template scores between them are noise — but unlike the bars and ohs the
 * pixels do decide: 'p' hangs below the baseline while 'P' sits on it. The
 * templates lose that position, the segment keeps it. Take the baseline as
 * the median ink bottom of the non-twin glyphs (most chars rest exactly on
 * it, so the median shrugs off real descenders and symbols) and pick the
 * case by whether the segment descends past it. Skipped when no other glyph
 * anchors the baseline.
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
