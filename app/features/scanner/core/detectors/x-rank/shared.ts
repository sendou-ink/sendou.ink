/**
 * Reads shared by the X Battle cards: the mode icon, BlitzBold numbers with
 * their punctuation, and color/ink fractions of small regions.
 */
import type { RankedModeShort } from "~/modules/in-game-lists/types";
import { getCV, type Mat } from "../../cv";
import { type GlyphSet, recognizeTextSteps } from "../../glyphs";
import { copyRoi, type FrameData, meanBrightness, type Roi } from "../../image";
import { all, type MatchSteps } from "../../match-steps";
import { MODE_ICON_MIN_SCORE, MODE_ICON_TEMPLATE_SIZES } from "./rois";

export const X_RANK_MODES: readonly RankedModeShort[] = [
	"SZ",
	"TC",
	"RM",
	"CB",
];

/** A segment shorter than this fraction of the line's digits is punctuation. */
const PUNCTUATION_MAX_HEIGHT_RATIO = 0.45;
/** Punctuation starting below this fraction of the line height is a decimal point. */
const DOT_MIN_TOP_RATIO = 0.6;
/** A leading sign flatter than this (height/width) is a minus; a plus is square. */
const MINUS_MAX_ASPECT = 0.6;
/** Ink runs below max(RUN_MIN_INK, RUN_MIN_INK_RATIO · lineHeight²) pixels are speckle; a decimal point clears it. */
const RUN_MIN_INK = 8;
const RUN_MIN_INK_RATIO = 0.01;
/** Columns of background kept around a run so its glyph edges survive masking. */
const RUN_PAD = 3;

export interface ModeIconTemplate {
	mode: RankedModeShort;
	/** RGB icon composited on black, one per MODE_ICON_TEMPLATE_SIZES entry */
	sizes: Mat[];
}

export interface NumberRead {
	/** digits plus "." "-" "+" told apart by geometry */
	text: string;
	/** per digit of `text`, in order */
	digitScores: number[];
}

interface InkRun {
	x0: number;
	/** exclusive */
	x1: number;
	y0: number;
	/** exclusive */
	y1: number;
	ink: number;
}

/** RGB templates from the RGBA mode icons (img/modes/<mode>.avif), tight to their alpha and composited on black like the card. */
export function prepareModeIconTemplates(
	icons: { id: string; image: FrameData }[],
): ModeIconTemplate[] {
	const cv = getCV();
	return icons.flatMap(({ id, image }) => {
		const mode = X_RANK_MODES.find((m) => m === id);
		if (!mode) return [];
		const { width, height, data } = image;
		let xMin = width;
		let xMax = -1;
		let yMin = height;
		let yMax = -1;
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				if (data[(y * width + x) * 4 + 3]! > 32) {
					xMin = Math.min(xMin, x);
					xMax = Math.max(xMax, x);
					yMin = Math.min(yMin, y);
					yMax = Math.max(yMax, y);
				}
			}
		}
		const w = Math.max(1, xMax - xMin + 1);
		const h = Math.max(1, yMax - yMin + 1);
		const composite = new cv.Mat(h, w, cv.CV_8UC3, new cv.Scalar(0, 0, 0));
		const dst = composite.data;
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const src = ((y + yMin) * width + x + xMin) * 4;
				const alpha = data[src + 3]! / 255;
				for (let c = 0; c < 3; c++) {
					dst[(y * w + x) * 3 + c] = Math.round(data[src + c]! * alpha);
				}
			}
		}
		const sizes = MODE_ICON_TEMPLATE_SIZES.map((size) => {
			const scale = size / Math.max(w, h);
			const resized = new cv.Mat();
			cv.resize(
				composite,
				resized,
				new cv.Size(
					Math.max(1, Math.round(w * scale)),
					Math.max(1, Math.round(h * scale)),
				),
				0,
				0,
				cv.INTER_AREA,
			);
			return resized;
		});
		composite.delete();
		return [{ mode, sizes }];
	});
}

/** The card's mode icon in `roi` of the frame's RGB; null below MODE_ICON_MIN_SCORE. */
export function* readModeIconSteps(
	rgb: Mat,
	roi: Roi,
	templates: readonly ModeIconTemplate[] | null | undefined,
): MatchSteps<{ mode: RankedModeShort | null; score: number }> {
	if (!templates || templates.length === 0) return { mode: null, score: 0 };
	const search = copyRoi(rgb, roi);
	const fitting = (t: ModeIconTemplate) =>
		t.sizes.filter((s) => s.rows <= search.rows && s.cols <= search.cols);
	const [scoreOf] = yield [
		{ image: search, templates: templates.flatMap((t) => fitting(t)) },
	];
	let best: { mode: RankedModeShort | null; score: number } = {
		mode: null,
		score: 0,
	};
	let index = 0;
	for (const template of templates) {
		for (const _ of fitting(template)) {
			const score = scoreOf!(index++);
			if (score > best.score) best = { mode: template.mode, score };
		}
	}
	search.delete();
	return best.score >= MODE_ICON_MIN_SCORE
		? best
		: { mode: null, score: best.score };
}

/**
 * Reads one line of BlitzBold digits. The digit templates can't match glyphs
 * smaller than themselves, so the line is cut into ink columns first: short
 * runs are a decimal point or a minus told apart by placement, each tall run
 * is recognized on its own (it may hold fused digits). `leading` handles a
 * glyph outside the digit set that opens the line: a sign ("+" is nearly
 * digit-tall, so only a flat one is "-") or one to drop (the position's "#").
 */
export function* readNumberSteps(
	gray: Mat,
	roi: Roi,
	digits: GlyphSet,
	binThreshold: number,
	speculative: boolean,
	leading?: "sign" | "skip",
): MatchSteps<NumberRead> {
	const cv = getCV();
	const crop = copyRoi(gray, roi);
	const binary = new cv.Mat();
	cv.threshold(crop, binary, binThreshold, 255, cv.THRESH_BINARY);
	const runs = inkRuns(binary);
	binary.delete();
	const lineHeight = Math.max(0, ...runs.map((r) => r.y1 - r.y0));
	const minInk = Math.max(
		RUN_MIN_INK,
		lineHeight * lineHeight * RUN_MIN_INK_RATIO,
	);
	const inked = runs.filter((r) => r.ink >= minInk);
	const lead = leading ? inked[0] : undefined;
	const kept = lead ? inked.slice(1) : inked;
	const isTall = (r: InkRun) =>
		r.y1 - r.y0 >= lineHeight * PUNCTUATION_MAX_HEIGHT_RATIO;
	const tall = kept.filter(isTall);
	const lineTop = Math.min(...tall.map((r) => r.y0));
	const crops = tall.map((r) => {
		const x0 = Math.max(0, r.x0 - RUN_PAD);
		return copyRoi(crop, {
			x: x0,
			y: 0,
			w: Math.min(crop.cols, r.x1 + RUN_PAD) - x0,
			h: crop.rows,
		});
	});
	const reads = yield* all(
		crops.map((c) =>
			recognizeTextSteps(
				c,
				digits,
				{ binThreshold, minCharScore: 0, spaceGap: Number.POSITIVE_INFINITY },
				speculative,
			),
		),
	);
	for (const c of crops) c.delete();
	crop.delete();

	let text = "";
	if (lead && leading === "sign") {
		text += isFlat(lead) ? "-" : "+";
	}
	const digitScores: number[] = [];
	for (const run of kept) {
		const index = tall.indexOf(run);
		if (index >= 0) {
			for (const char of reads[index]!.chars) {
				text += char.char;
				digitScores.push(char.score);
			}
		} else if (run.y0 - lineTop >= lineHeight * DOT_MIN_TOP_RATIO) {
			text += ".";
		} else {
			text += "-";
		}
	}
	return { text, digitScores };
}

/** Lowest of `scores`; 0 when empty. */
export function minScore(scores: readonly number[]): number {
	return scores.length > 0 ? Math.min(...scores) : 0;
}

/** Every probe's mean brightness is at most `max`. */
export function allDark(
	gray: Mat,
	probes: readonly Roi[],
	max: number,
): boolean {
	return probes.every((roi) => meanBrightness(gray, roi) <= max);
}

/** Fraction of `roi`'s pixels (of an RGB mat) passing `predicate`. */
export function rgbFraction(
	rgb: Mat,
	roi: Roi,
	predicate: (r: number, g: number, b: number) => boolean,
): number {
	const crop = copyRoi(rgb, roi);
	const data = crop.data;
	let hits = 0;
	for (let i = 0; i < data.length; i += 3) {
		if (predicate(data[i]!, data[i + 1]!, data[i + 2]!)) hits++;
	}
	crop.delete();
	return hits / (roi.w * roi.h);
}

/** Fraction of a grayscale `roi` at or above `threshold`. */
export function brightFraction(gray: Mat, roi: Roi, threshold: number): number {
	const cv = getCV();
	const crop = copyRoi(gray, roi);
	const bin = new cv.Mat();
	cv.threshold(crop, bin, threshold - 1, 255, cv.THRESH_BINARY);
	const fraction = cv.countNonZero(bin) / (roi.w * roi.h);
	bin.delete();
	crop.delete();
	return fraction;
}

function isFlat(run: InkRun): boolean {
	return (run.y1 - run.y0) / (run.x1 - run.x0) < MINUS_MAX_ASPECT;
}

/** Column runs of ink in a binary mat, each with its row extent and pixel count. */
function inkRuns(binary: Mat): InkRun[] {
	const { rows, cols, data } = binary;
	const runs: InkRun[] = [];
	let current: InkRun | null = null;
	for (let x = 0; x < cols; x++) {
		let y0 = -1;
		let y1 = -1;
		let ink = 0;
		for (let y = 0; y < rows; y++) {
			if (data[y * cols + x]! > 0) {
				if (y0 < 0) y0 = y;
				y1 = y + 1;
				ink++;
			}
		}
		if (ink === 0) {
			current = null;
			continue;
		}
		if (!current) {
			current = { x0: x, x1: x + 1, y0, y1, ink };
			runs.push(current);
		} else {
			current.x1 = x + 1;
			current.y0 = Math.min(current.y0, y0);
			current.y1 = Math.max(current.y1, y1);
			current.ink += ink;
		}
	}
	return runs;
}
