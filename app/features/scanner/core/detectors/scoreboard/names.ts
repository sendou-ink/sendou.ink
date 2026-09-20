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
 * decides: opening a word before a consonant 'I' ("Invisifloats", no word
 * starts "ln"/"lv"), otherwise next to lowercase 'l' ("Olise", "lucas"), digit
 * '1' ("Jrod_14"), uppercase 'I' ("SHIP"), off an underscore '1' ("gori_1"),
 * else 'l'. Misses "McIntosh", but so would a human reading the pixels.
 */
const BAR_CHARS = new Set(["I", "l", "|", "1"]);
const LOWER_CONSONANT = /^[b-df-hj-np-tv-xz]$/;

/** recognizeText's own default, shared with the mark probes so both see the same ink */
const DEFAULT_BIN_THRESHOLD = 150;
/** deep enough for an accented variant to survive a stack of bare-letter fixture crops */
const NAME_MAX_CANDIDATES = 12;

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
			const wordInitial =
				i === 0 || chars[i - 1] === " " || chars[i - 1] === "_";
			if (wordInitial && LOWER_CONSONANT.test(chars[i + 1] ?? "")) return "I";
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
 * Kana punctuation ('・') is not a kana neighbor: "x²-8" must keep its hyphen.
 */
const LONG_BAR_CHARS = new Set(["-", "ー"]);
const KANA_LETTER = /[ぁ-ゖァ-ヺ]/u;

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
	const isKana = test(KANA_LETTER);
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
 * A long bar is '_' or a dash by height alone, which the templates weigh
 * lightly: ">_<" read ">ー<". A bar whose bottom reaches the line's baseline
 * (median ink bottom of the other glyphs) is an underscore; dashes float at
 * mid height.
 */
const BASELINE_BAR_CHARS = new Set(["-", "ー", "¯", "_"]);
const UNDERSCORE_BASELINE_SLACK_PX = 2;

function resolveUnderscoreByBaseline(raw: RecognizedText): RecognizedText {
	if (!raw.chars.some((c) => LONG_BAR_CHARS.has(c.char))) return raw;
	const anchors = raw.chars
		.filter((c) => !BASELINE_BAR_CHARS.has(c.char))
		.map((c) => c.y1)
		.sort((a, b) => a - b);
	if (anchors.length === 0) return raw;
	const baseline = anchors[Math.floor(anchors.length / 2)]!;
	const chars = raw.chars.map((c) => {
		if (!LONG_BAR_CHARS.has(c.char)) return c;
		if (baseline - c.y1 > UNDERSCORE_BASELINE_SLACK_PX) return c;
		return { ...c, char: "_" };
	});
	return { ...raw, text: retext(raw.text, chars), chars };
}

/** Rebuild the text from re-decided chars, keeping the spaces where they were. */
function retext(text: string, chars: RecognizedChar[]): string {
	let ci = 0;
	return [...text].map((ch) => (ch === " " ? ch : chars[ci++]!.char)).join("");
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
	return { ...raw, text: retext(raw.text, chars), chars };
}

/**
 * On soft captures 'b' vs 'h' comes down to the bowl floor, which correlation
 * weighs too lightly (font 'h' beats fixture 'b' by ~0.003 on a true 'b'). The
 * bottom band between the stems is bright in a 'b' and dark in an 'h', but blur
 * lifts it in both, so it is read against the band just below the arch, which
 * blur lifts the same way: measured across fixtures at 15-50px, a 'b' floor
 * is 90+ gray levels brighter than its mid band, an 'h' floor never brighter.
 * Only near-ties are re-decided.
 */
const BH_TWINS: Record<string, string> = { b: "h", h: "b" };
const BH_SCORE_MARGIN = 0.08;
const BH_BOWL_MIN_CONTRAST = 40;

function resolveBhByBowlFloor(
	raw: RecognizedText,
	grayView: Mat,
): RecognizedText {
	const contested = (c: RecognizedChar) => {
		const twin = BH_TWINS[c.char];
		if (!twin) return false;
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
	const bandMean = (x0: number, x1: number, y0: number, y1: number) => {
		let sum = 0;
		let total = 0;
		for (let y = y0; y < y1; y++) {
			for (let x = x0; x < x1; x++) {
				sum += data[y * cols + x]!;
				total++;
			}
		}
		return total > 0 ? sum / total : 0;
	};
	const chars = raw.chars.map((c) => {
		if (!contested(c)) return c;
		const w = c.x1 - c.x0;
		const h = c.y1 - c.y0;
		const cx0 = c.x0 + Math.round(w * 0.3);
		const cx1 = c.x1 - Math.round(w * 0.3);
		const floor = bandMean(
			cx0,
			cx1,
			c.y1 - Math.max(2, Math.round(h * 0.18)),
			c.y1,
		);
		const mid = bandMean(
			cx0,
			cx1,
			c.y0 + Math.round(h * 0.45),
			c.y0 + Math.round(h * 0.6),
		);
		return { ...c, char: floor - mid >= BH_BOWL_MIN_CONTRAST ? "b" : "h" };
	});
	gray.delete();
	return { ...raw, text: retext(raw.text, chars), chars };
}

/**
 * A (han)dakuten is two short ticks (or a ring) floating above the base kana's
 * upper right. Capture blur thins those ticks, so the ink-coverage penalty lets
 * the plain twin ('か') edge out the voiced glyph ('が') whose extra template ink
 * the thinned segment no longer explains — even when the voiced template
 * correlates better (quick-log ジ over シ on raw NCC, and lost the tie). When a
 * plain kana wins a near-tie over a voiced twin, the segment's own row profile
 * decides: a 2+ row blob confined to the segment's right half, a blank row under
 * it and a base at least half the height beneath is the floating mark. Only that
 * direction is re-decided: the game draws some marks touching the base stroke
 * (quick-log ば, ギ) and the templates already read those right, so a missing gap
 * must not demote a voiced read. A plain kana's own detached top tick (う) starts
 * far left of the mark's column band and fails the left-edge floor.
 */
const VOICED_TWINS: Record<string, string[]> = {};
for (const [plain, voiced] of [
	[
		"かきくけこさしすせそたちつてとはひふへほう",
		"がぎぐげござじずぜぞだぢづでどばびぶべぼゔ",
	],
	["はひふへほ", "ぱぴぷぺぽ"],
	[
		"カキクケコサシスセソタチツテトハヒフヘホウ",
		"ガギグゲゴザジズゼゾダヂヅデドバビブベボヴ",
	],
	["ハヒフヘホ", "パピプペポ"],
] as const) {
	for (const [i, base] of [...plain].entries()) {
		VOICED_TWINS[base] = [...(VOICED_TWINS[base] ?? []), [...voiced][i]!];
	}
}
const VOICED_SCORE_MARGIN = 0.1;
const MARK_MAX_HEIGHT_FRACTION = 0.4;
const BASE_MIN_HEIGHT_FRACTION = 0.5;
/** the (han)dakuten: upper-right corner; a blank gap row tolerates one noise pixel */
const VOICED_MARK_SHAPE: MarkShape = {
	minLeft: 0.35,
	minRight: 0.75,
	maxWidth: 1,
	gapMaxInkFraction: 0,
};

function resolveVoicedByMark(
	raw: RecognizedText,
	grayView: Mat,
	binThreshold: number,
): RecognizedText {
	const voicedRunnerUp = (c: RecognizedChar) => {
		const twins = VOICED_TWINS[c.char];
		if (!twins) return undefined;
		return c.candidates?.find(
			(k) => twins.includes(k.char) && c.score - k.score <= VOICED_SCORE_MARGIN,
		);
	};
	if (!raw.chars.some(voicedRunnerUp)) return raw;

	const gray = new (getCV().Mat)();
	grayView.copyTo(gray);
	const { cols, data } = gray;
	const chars = raw.chars.map((c) => {
		const twin = voicedRunnerUp(c);
		if (
			!twin ||
			!hasFloatingMark(data, cols, c, binThreshold, VOICED_MARK_SHAPE)
		)
			return c;
		return { ...c, char: twin.char, score: twin.score };
	});
	gray.delete();
	return { ...raw, text: retext(raw.text, chars), chars };
}

/** Where a detached mark may sit over its base glyph, as fractions of the segment width. */
interface MarkShape {
	/** the mark's left edge is at least this far in */
	minLeft: number;
	/** the mark's right edge reaches at least this far */
	minRight: number;
	/** the mark spans at most this much of the width */
	maxWidth: number;
	/** ink a row may hold and still be the gap under the mark, beyond one noise pixel */
	gapMaxInkFraction: number;
}

/**
 * Detached blob on top of the segment: 2+ ink rows (after any sparse leading
 * rows, the antialiased top of the mark), a sparse row under it and a base at
 * least half the height beneath, with the blob's columns inside `shape`.
 */
function hasFloatingMark(
	data: Uint8Array,
	cols: number,
	c: RecognizedChar,
	binThreshold: number,
	shape: MarkShape,
): boolean {
	const w = c.x1 - c.x0;
	const h = c.y1 - c.y0;
	const gapMaxInk = Math.max(1, shape.gapMaxInkFraction * w);
	let markRows = 0;
	let markX0 = Number.POSITIVE_INFINITY;
	let markX1 = -1;
	let y = c.y0;
	for (; y < c.y1; y++) {
		let ink = 0;
		let lo = -1;
		let hi = -1;
		for (let x = c.x0; x < c.x1; x++) {
			if (data[y * cols + x]! > binThreshold) {
				ink++;
				if (lo < 0) lo = x;
				hi = x;
			}
		}
		if (ink <= gapMaxInk) {
			if (markRows === 0) continue;
			break;
		}
		markRows++;
		markX0 = Math.min(markX0, lo);
		markX1 = Math.max(markX1, hi);
	}
	if (markRows < 2 || markRows > MARK_MAX_HEIGHT_FRACTION * h) return false;
	if (y >= c.y1) return false;
	for (; y < c.y1; y++) {
		let ink = 0;
		for (let x = c.x0; x < c.x1; x++) {
			if (data[y * cols + x]! > binThreshold) ink++;
		}
		if (ink > gapMaxInk) break;
	}
	if (c.y1 - y < BASE_MIN_HEIGHT_FRACTION * h) return false;
	return (
		(markX0 - c.x0) / w >= shape.minLeft &&
		(markX1 + 1 - c.x0) / w >= shape.minRight &&
		(markX1 + 1 - markX0) / w <= shape.maxWidth
	);
}

/**
 * Latin accents at name size are thin, so the exact fixture crop of the bare
 * letter outranks the font-rendered accented glyph (fixture 'u' over 'Ù' by
 * 0.001; 'ó' trails a stack of 'o' crops). A bare Latin letter whose segment
 * carries a detached blob above the letter body is re-decided to its best
 * accented candidate. 'i' and 'j' carry their own detached dot and are exempt;
 * the margin is wide because the mark itself is the evidence.
 */
const ACCENT_SCORE_MARGIN = 0.15;
const ACCENT_EXEMPT = new Set(["i", "j"]);
/**
 * Anywhere over the letter but narrower than it, so the bar of a 'T' or the arms
 * of a 'Y' over their stem never pass; blur leaves a couple of pixels in the
 * gap row under an 'ó' accent, which stems (a quarter width and more) exceed.
 */
const ACCENT_MARK_SHAPE: MarkShape = {
	minLeft: 0,
	minRight: 0,
	maxWidth: 0.8,
	gapMaxInkFraction: 0.25,
};

function resolveAccentByMark(
	raw: RecognizedText,
	grayView: Mat,
	binThreshold: number,
): RecognizedText {
	const accentedRunnerUp = (c: RecognizedChar) => {
		if (!/^\p{Script=Latin}$/u.test(c.char) || ACCENT_EXEMPT.has(c.char))
			return undefined;
		if (c.char !== stripMarks(c.char)) return undefined;
		return c.candidates?.find(
			(k) =>
				k.char !== stripMarks(k.char) &&
				stripMarks(k.char).toLowerCase() === c.char.toLowerCase() &&
				c.score - k.score <= ACCENT_SCORE_MARGIN,
		);
	};
	if (!raw.chars.some(accentedRunnerUp)) return raw;

	const gray = new (getCV().Mat)();
	grayView.copyTo(gray);
	const { cols, data } = gray;
	const chars = raw.chars.map((c) => {
		const accented = accentedRunnerUp(c);
		if (
			!accented ||
			!hasFloatingMark(data, cols, c, binThreshold, ACCENT_MARK_SHAPE)
		)
			return c;
		return { ...c, char: accented.char, score: accented.score };
	});
	gray.delete();
	return { ...raw, text: retext(raw.text, chars), chars };
}

function stripMarks(s: string): string {
	return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
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

/**
 * Near-tie homoglyphs re-decided toward the plain form before the context
 * rules run (opt-in via `plainTieMargin`; the kill feed's ~24px rows need it):
 * the dot of 'i' alone ranks 'í'/'ì' level with 'i', a blurred 'l' ranks 'í'
 * over the bar glyphs, and a fullwidth bracket lands level with its ASCII
 * twin — while a real accent or double stroke ranks the plain form well
 * lower. A dotted vowel may also fall to a bar glyph, which the bar rule
 * then reads in context.
 */
const PLAIN_TWINS: Record<string, string> = { "【": "[", "】": "]" };

function preferPlainTies(raw: RecognizedText, margin: number): RecognizedText {
	const chars = raw.chars.map((c) => {
		const twin = PLAIN_TWINS[c.char];
		const base = c.char.normalize("NFD").replace(/[̀-ͯ]/g, "");
		const accented = twin === undefined && base.length === 1 && base !== c.char;
		const plain = twin ?? (accented ? base : undefined);
		if (plain === undefined || !c.candidates) return c;
		const top = c.candidates[0]?.score ?? c.score;
		const pick = c.candidates.find(
			(k) =>
				(k.char === plain || (accented && BAR_CHARS.has(k.char))) &&
				top - k.score <= margin,
		);
		return pick ? { ...c, char: pick.char, score: pick.score } : c;
	});
	return { ...raw, text: retext(raw.text, chars), chars };
}

export function parseName(
	gray: Mat,
	glyphs: GlyphSet,
	options: {
		spaceGap?: number;
		binThreshold?: number;
		/** re-decide near-tie homoglyphs toward the plain form (preferPlainTies) */
		plainTieMargin?: number;
	} = {},
): ParsedName {
	const binThreshold = options.binThreshold ?? DEFAULT_BIN_THRESHOLD;
	const recognized = recognizeText(gray, glyphs, {
		spaceGap: options.spaceGap ?? 7,
		binThreshold,
		minCharScore: 0.35,
		maxCandidates: NAME_MAX_CANDIDATES,
	});
	const raw =
		options.plainTieMargin === undefined
			? recognized
			: preferPlainTies(recognized, options.plainTieMargin);
	const name = normalizeLongBars(
		normalizeOhs(
			normalizeBars(
				resolveCaseByDescent(
					resolveAccentByMark(
						resolveVoicedByMark(
							resolveBhByBowlFloor(
								fixRaisedDots(resolveUnderscoreByBaseline(raw)),
								gray,
							),
							gray,
							binThreshold,
						),
						gray,
						binThreshold,
					),
				).trim(),
			),
		),
	);
	return {
		name,
		confidence: raw.confidence,
		raw,
	};
}
