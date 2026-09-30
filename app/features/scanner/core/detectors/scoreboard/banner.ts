/**
 * "Score:" banner parsing: each side shows a team's score (0-100) as white
 * BlitzBold digits after a localized label (some languages have none, so x is
 * not fixed). A knockout replaces the winner's value with the KNOCKOUT! burst
 * (weak digit matches; real digits score 0.9+) and is recognized from the
 * winner's team total instead (count x5; only a full 100 reaches 500). Digits
 * bounce as the value lands, so every size and threshold is parsed and the best
 * read kept (valid over none, longer run over shorter, then confidence).
 */
import { getCV, type Mat } from "../../cv";
import {
	type GlyphSet,
	type RecognizedChar,
	type RecognizedText,
	recognizeText,
} from "../../glyphs";
import { copyRoi, type Roi } from "../../image";

/** The count a knockout wins at — the burst hides it, so it is never read. */
export const KO_MATCH_SCORE = 100;

/**
 * The team box prints count x5 ("440 p" for 88), so only a knockout reaches 500; separates a
 * burst-covered banner from an unread one.
 */
export const FULL_COUNT_TEAM_SCORE = KO_MATCH_SCORE * 5;

/** Replay-screen reads below this are discarded: burst/label letters match digit templates at ~0.4 there. */
export const MATCH_SCORE_MIN_CONF = 0.6;

/**
 * Char floor for the trailing-digit run: KNOCKOUT! letters reach 0.62 (ko-hagglefish "07"), real
 * digits 0.79+ on every fixture.
 */
const DIGIT_MIN_CONF = 0.75;

/** White banner digits on saturated team color (yellow ink grays at ~170). */
const BANNER_SCORE_BIN_THRESHOLD = 205;

/**
 * Second pass for pale banners (gray ~220): the base threshold glues label and
 * digits into one blob, swallowing all but the last digit; only ~250 digit ink
 * survives this. A swallowed background can only shorten the run, so the
 * longer run wins regardless of confidence.
 */
const BANNER_SCORE_BRIGHT_BIN_THRESHOLD = 240;

/**
 * Third pass: a yellow battle-log banner grays at ~245 near the wave crest; only the ~250 digit
 * cores survive this.
 */
const BANNER_SCORE_BRIGHTEST_BIN_THRESHOLD = 248;

/** Digits of one number nearly touch; a gap past this fraction of a digit width ends the run. */
const DIGIT_GAP_MAX_RATIO = 0.55;

/** Digits span the set's full height; the label's lowercase letters top out ~0.75 of it. */
const DIGIT_MIN_HEIGHT_RATIO = 0.82;

/**
 * The wave-crest highlight dips into the score line as a ~12px streak merging into digit segments;
 * real digits are ~26px+ tall.
 */
const MIN_COMPONENT_HEIGHT = 20;

export interface BannerScoreRead {
	/** the side's score; null when unread (knockout burst, blur, label-only) */
	value: number | null;
	/** min glyph score across the accepted digits (0 when none) */
	confidence: number;
	/** digits in the accepted run (0 when unread) */
	digits: number;
	/** best raw reading, for debugging */
	reading: string;
}

const EMPTY_READ: BannerScoreRead = {
	value: null,
	confidence: 0,
	digits: 0,
	reading: "",
};

/**
 * One banner side's score: each digit set at each threshold, best read kept
 * (isBetterRead). The score is the trailing run of full-height, confident
 * digits; label and burst leftovers fail at least one of those tests.
 */
export function parseBannerScore(
	gray: Mat,
	roi: Roi,
	sets: readonly GlyphSet[],
): BannerScoreRead {
	const crop = copyRoi(gray, roi);
	clearShortBlobs(crop);
	let best = EMPTY_READ;
	for (const binThreshold of [
		BANNER_SCORE_BIN_THRESHOLD,
		BANNER_SCORE_BRIGHT_BIN_THRESHOLD,
		BANNER_SCORE_BRIGHTEST_BIN_THRESHOLD,
	]) {
		for (const set of sets) {
			const raw = recognizeText(crop, set, {
				binThreshold,
				spaceGap: Number.POSITIVE_INFINITY,
				minCharScore: 0.3,
			});
			const read = trailingDigitRun(raw, set);
			if (isBetterRead(read, best)) best = read;
		}
	}
	crop.delete();
	return best;
}

/**
 * Winner-first score pair. A confirmed knockout dominates: winner = full count,
 * loser = the more confident read. Otherwise ranked scores never tie so the
 * higher value is the winner's; one unreadable side reports nothing.
 */
export function resolveMatchScores({
	left,
	right,
	knockout,
}: {
	left: BannerScoreRead;
	right: BannerScoreRead;
	knockout: boolean;
}): [number | null, number | null] {
	if (knockout) {
		const loser =
			left.value !== null && right.value !== null
				? left.confidence >= right.confidence
					? left
					: right
				: left.value !== null
					? left
					: right;
		return [KO_MATCH_SCORE, loser.value];
	}
	if (left.value !== null && right.value !== null) {
		return left.value >= right.value
			? [left.value, right.value]
			: [right.value, left.value];
	}
	return [null, null];
}

/** Zero out ink components shorter than any digit (see MIN_COMPONENT_HEIGHT). */
function clearShortBlobs(band: Mat): void {
	const cv = getCV();
	const bin = new cv.Mat();
	cv.threshold(band, bin, BANNER_SCORE_BIN_THRESHOLD, 255, cv.THRESH_BINARY);
	const labels = new cv.Mat();
	const stats = new cv.Mat();
	const centroids = new cv.Mat();
	const count = cv.connectedComponentsWithStats(
		bin,
		labels,
		stats,
		centroids,
		8,
	);
	bin.delete();
	centroids.delete();
	const s = stats.data32S;
	const short = new Uint8Array(count);
	for (let i = 1; i < count; i++) {
		short[i] = s[i * 5 + cv.CC_STAT_HEIGHT]! < MIN_COMPONENT_HEIGHT ? 1 : 0;
	}
	stats.delete();
	const lab = labels.data32S;
	const out = band.data;
	for (let i = 0; i < out.length; i++) {
		if (short[lab[i]!]!) out[i] = 0;
	}
	labels.delete();
}

/** A valid value beats none, a longer digit run beats a shorter one, confidence breaks ties. */
export function isBetterRead(
	read: BannerScoreRead,
	best: BannerScoreRead,
): boolean {
	if ((read.value !== null) !== (best.value !== null)) {
		return read.value !== null;
	}
	if (read.digits !== best.digits) return read.digits > best.digits;
	return read.confidence > best.confidence;
}

export interface TrailingDigitOptions {
	/** char floor a glyph must clear to count as a digit of the number */
	minCharScore?: number;
	/**
	 * lower floor for digits joining a run anchored by a `minCharScore` digit
	 * (blur can erode one digit while its neighbor stays crisp); defaults to `minCharScore`
	 */
	extendMinScore?: number;
	/** min ink height as a fraction of the set height (drops labels, '+') */
	minHeightRatio?: number;
	/** values above this are rejected as misreads */
	maxValue?: number;
	/**
	 * reject the read when a char within digit-gap distance left of the run failed
	 * the floors: on a number-only band that is a mangled leading digit ("50" as
	 * 0). Off for banners, where a label/burst letter legitimately borders the digits.
	 */
	rejectTruncated?: boolean;
}

/** Trailing run of full-height, confident digits; shared by the score banner and objective counters. */
export function trailingDigitRun(
	raw: RecognizedText,
	set: GlyphSet,
	options: TrailingDigitOptions = {},
): BannerScoreRead {
	const {
		minCharScore = DIGIT_MIN_CONF,
		extendMinScore = minCharScore,
		minHeightRatio = DIGIT_MIN_HEIGHT_RATIO,
		maxValue = KO_MATCH_SCORE,
		rejectTruncated = false,
	} = options;
	const maxGap = Math.max(4, Math.round(set.medianWidth * DIGIT_GAP_MAX_RATIO));
	const fullHeight = (c: RecognizedChar) =>
		c.y1 - c.y0 >= set.height * minHeightRatio;
	const isRunDigit = (c: RecognizedChar) =>
		c.score >= extendMinScore && fullHeight(c);

	const run: RecognizedChar[] = [];
	let i = raw.chars.length - 1;
	for (; i >= 0; i--) {
		const c = raw.chars[i]!;
		if (!isRunDigit(c)) break;
		if (run.length > 0 && run[0]!.x0 - c.x1 > maxGap) break;
		run.unshift(c);
	}
	if (run.length === 0) return { ...EMPTY_READ, reading: raw.text };
	if (!run.some((c) => c.score >= minCharScore)) {
		return { ...EMPTY_READ, reading: raw.text };
	}
	// a further digit left of the run means an unreadable glyph split the number
	// (turf war "48", ".", "7"); the tail is not the score
	for (let k = i; k >= 0; k--) {
		const c = raw.chars[k]!;
		if (c.score >= minCharScore && fullHeight(c)) {
			return { ...EMPTY_READ, reading: raw.text };
		}
	}
	if (rejectTruncated && i >= 0 && run[0]!.x0 - raw.chars[i]!.x1 <= maxGap) {
		return { ...EMPTY_READ, reading: raw.text };
	}

	const value = Number.parseInt(run.map((c) => c.char).join(""), 10);
	if (value > maxValue) return { ...EMPTY_READ, reading: raw.text };
	return {
		value,
		confidence: Math.min(...run.map((c) => c.score)),
		digits: run.length,
		reading: raw.text,
	};
}
