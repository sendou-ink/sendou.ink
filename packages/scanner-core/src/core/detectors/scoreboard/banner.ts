/**
 * "Score:" banner parsing for the results screens. Each side of the colored
 * banner shows one team's game score (0-100) as white BlitzBold digits after
 * a localized label — some languages render no label at all, so the digits'
 * x position is not fixed. A knockout replaces the winning side's value with
 * the localized KNOCKOUT! burst, whose letters only weakly match digit
 * templates (real digits score 0.9+); the knockout itself is recognized from
 * the winner's team total instead (the box prints the count times five, and
 * only a knockout's full 100 count reaches 500). The score value bounces as
 * it lands, so a frame may catch the digits settled or mid-pop — this module
 * parses at every size and binarization threshold and keeps the best
 * read (valid over none, longer digit run over shorter, then confidence).
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
 * The team box prints the count times five ("440 p" alongside a 88 banner),
 * so a knockout's full 100 count shows as 500 — a total only a knockout
 * reaches, which is what separates a burst-covered banner from an unread one.
 */
export const FULL_COUNT_TEAM_SCORE = KO_MATCH_SCORE * 5;

/**
 * Replay-screen reads below this floor are discarded rather than trusted as
 * a score — burst/label letters overlapping a score ROI match digit
 * templates at ~0.4 there.
 */
export const MATCH_SCORE_MIN_CONF = 0.6;

/**
 * Char floor for the live banner's trailing-digit run. KNOCKOUT! letters
 * have matched digit templates at up to 0.62 (the ko-hagglefish fixture's
 * "07"), while genuine banner digits score 0.79+ across every fixture —
 * including 720p upscales.
 */
const DIGIT_MIN_CONF = 0.75;

/** White banner digits on saturated team color (yellow ink grays at ~170). */
const BANNER_SCORE_BIN_THRESHOLD = 205;

/**
 * Second binarization pass for pale team colors: a light banner (gray ~220,
 * with the wave-crest highlight brighter still) binarizes solid white at the
 * base threshold, gluing label and digits into one giant unmatchable blob
 * that can swallow all but the last digit. Only the ~250 digit ink survives
 * this threshold. Every pass always runs; a swallowed background can only
 * shorten the digit run, never lengthen it, so the longer run wins
 * regardless of confidence (the truncated read's surviving digit is genuine
 * ink and scores just as well).
 */
const BANNER_SCORE_BRIGHT_BIN_THRESHOLD = 240;

/**
 * Third pass for the brightest banners: a yellow battle-log banner grays at
 * ~245 near the wave crest, so even the bright pass keeps label ink attached
 * and erodes the digits below the confidence floor. Only the ~250 digit
 * cores survive this threshold.
 */
const BANNER_SCORE_BRIGHTEST_BIN_THRESHOLD = 248;

/**
 * Digits of one number nearly touch; anything further apart than this
 * fraction of a digit width is the label (or an unreadable glyph) ending
 * the run.
 */
const DIGIT_GAP_MAX_RATIO = 0.55;

/**
 * A score digit spans the set's full height; the label's lowercase letters
 * top out ~0.75 of it, so they cannot pass as digits even when their shapes
 * correlate.
 */
const DIGIT_MIN_HEIGHT_RATIO = 0.82;

/**
 * The banner's bright wave-crest highlight can dip into the score line as a
 * wide ~12px-tall streak whose columns merge into the digits' segments and
 * ruin their ink extents. Every real digit is at least ~26px tall, so ink
 * components shorter than this are wiped before recognition.
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
 * Reads one banner side's score from `roi`: recognizes with each digit set
 * (one per on-screen text size) at each binarization threshold and keeps
 * the best read — a valid value beats none, a longer digit run beats a
 * shorter one, confidence breaks ties. The score is the trailing run of
 * full-height, confidently-matched digits — everything the localized label
 * or the KNOCKOUT! burst leaves in the ROI fails at least one of those
 * tests.
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
 * Winner-first score pair from the two banner sides. A confirmed knockout
 * (winner team total = 500) dominates: the winner reports the full count no
 * matter what was read off the burst-covered side, and the loser is the
 * more confident read (genuine digits score well clear of burst letters
 * that survive the floor). Without a knockout, ranked scores never tie, so
 * when both sides read the higher value is the winner's; one unreadable
 * side cannot be attributed to a team, so nothing is reported.
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

/**
 * Read preference shared by every multi-attempt digit read: a valid value
 * beats none, a longer digit run beats a shorter one, confidence breaks
 * ties.
 */
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
	 * lower floor for digits joining a run that another digit anchors at
	 * `minCharScore` — motion blur / compression can erode one digit of a
	 * genuine number below the main floor while its neighbor stays crisp.
	 * Defaults to `minCharScore` (no two-tier extension).
	 */
	extendMinScore?: number;
	/** min ink height as a fraction of the set height (drops labels, '+') */
	minHeightRatio?: number;
	/** values above this are rejected as misreads */
	maxValue?: number;
	/**
	 * reject the read (null) when the char immediately left of the run sat
	 * within digit-gap distance but failed the floors — on a band that holds
	 * nothing but the number (objective counter plates), that char is a
	 * blur-mangled leading digit and the run is a truncated misread ("50"
	 * returning 0). Off for banner bands, where an adjacent label/burst
	 * letter legitimately borders the digits.
	 */
	rejectTruncated?: boolean;
}

/**
 * The trailing run of full-height, confidently-matched digits of a
 * recognized line — the number-on-a-plate read shared by the score banner
 * and the objective counters, where a localized label / burst / '+' sign
 * precedes the digits and must fail at least one of the floors.
 */
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
	// A further digit left of the run means an unreadable glyph split the
	// number (turf war percentages read "48", ".", "7") — the tail is not
	// the score.
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
