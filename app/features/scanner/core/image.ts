/**
 * Environment-agnostic frame representation: a FrameData is RGBA with the
 * same layout as browser ImageData (Node builds it from @napi-rs/canvas).
 */

import { CANONICAL_HEIGHT, CANONICAL_WIDTH, type Roi } from "./canonical";
import { getCV, type Mat, meanOf, minMaxLoc } from "./cv";

export type { Roi };

export interface FrameData {
	width: number;
	height: number;
	/** RGBA, 4 bytes per pixel */
	data: Uint8ClampedArray;
}

export function toMat(frame: FrameData): Mat {
	const cv = getCV();
	// matFromImageData only reads width/height/data, so FrameData is compatible
	return cv.matFromImageData(frame as unknown as ImageData);
}

/** Normalizes any frame to the canonical 1920x1080 RGBA mat all ROI constants assume. New mat; caller owns both. */
export function normalizeFrame(src: Mat): Mat {
	const cv = getCV();
	const dst = new cv.Mat();
	if (src.cols === CANONICAL_WIDTH && src.rows === CANONICAL_HEIGHT) {
		src.copyTo(dst);
		return dst;
	}
	const interpolation =
		src.cols > CANONICAL_WIDTH ? cv.INTER_AREA : cv.INTER_CUBIC;
	cv.resize(
		src,
		dst,
		new cv.Size(CANONICAL_WIDTH, CANONICAL_HEIGHT),
		0,
		0,
		interpolation,
	);
	return dst;
}

/**
 * Crops a rect out of a mat as a view: fine as *input* to OpenCV calls but
 * NEVER read `.data` off it — this opencv.js build mishandles `.data` and
 * `.clone()` on non-continuous views. Use copyRoi for pixel access.
 */
export function cropRoi(src: Mat, roi: Roi): Mat {
	const cv = getCV();
	return src.roi(new cv.Rect(roi.x, roi.y, roi.w, roi.h));
}

/** Crop a rect into a fresh continuous mat (safe for `.data` access). */
export function copyRoi(src: Mat, roi: Roi): Mat {
	const view = cropRoi(src, roi);
	const out = new (getCV().Mat)();
	view.copyTo(out);
	view.delete();
	return out;
}

/**
 * Mean brightness of a ROI: average of the first three channels on a color
 * mat, the single channel's mean on grayscale. The shared gate probe.
 */
export function meanBrightness(mat: Mat, roi: Roi): number {
	const view = cropRoi(mat, roi);
	const m = meanOf(view);
	view.delete();
	return mat.channels() >= 3 ? (m[0]! + m[1]! + m[2]!) / 3 : m[0]!;
}

/** Brightest pixel of a grayscale ROI. */
export function maxBrightness(gray: Mat, roi: Roi): number {
	const view = cropRoi(gray, roi);
	const { maxVal } = minMaxLoc(view);
	view.delete();
	return maxVal;
}

function channelExtreme(
	mat: Mat,
	roi: Roi | undefined,
	op: "min" | "max",
): Mat {
	const cv = getCV();
	const view = roi ? cropRoi(mat, roi) : null;
	const src = view ?? mat;
	const channels = new cv.MatVector();
	cv.split(src, channels);
	const r = channels.get(0);
	const g = channels.get(1);
	const b = channels.get(2);
	const rg = new cv.Mat();
	const out = new cv.Mat();
	if (op === "max") {
		cv.max(r, g, rg);
		cv.max(rg, b, out);
	} else {
		cv.min(r, g, rg);
		cv.min(rg, b, out);
	}
	rg.delete();
	r.delete();
	g.delete();
	b.delete();
	if (mat.channels() === 4) channels.get(3).delete();
	channels.delete();
	view?.delete();
	return out;
}

/** Brightest channel per pixel, so colored text binarizes like white. */
export function maxChannel(mat: Mat, roi?: Roi): Mat {
	return channelExtreme(mat, roi, "max");
}

/** Per-pixel min of R/G/B — drops color-tinted brightness, keeps white. */
export function minChannel(mat: Mat, roi?: Roi): Mat {
	return channelExtreme(mat, roi, "min");
}

/**
 * Coarse content fingerprint of a grayscale ROI: mean brightness per cell of a
 * cols x rows grid. Consecutive frames of one static screen move a cell by
 * ≤~2 while different content moves cells by tens (measured on battle log
 * browsing) — the scheduler compares fingerprints to re-arm suppression when
 * a passing gate's screen flips to a new occurrence (GateResult.signature).
 */
export function roiSignature(
	gray: Mat,
	roi: Roi,
	cols: number,
	rows: number,
): number[] {
	const cv = getCV();
	const view = cropRoi(gray, roi);
	const small = new cv.Mat();
	cv.resize(view, small, new cv.Size(cols, rows), 0, 0, cv.INTER_AREA);
	view.delete();
	const cells = Array.from(small.data as Uint8Array, Number);
	small.delete();
	return cells;
}

/** |Laplacian| response of a grayscale mat; caller owns the result. */
export function laplacianAbs(gray: Mat): Mat {
	const cv = getCV();
	const lap = new cv.Mat();
	cv.Laplacian(gray, lap, cv.CV_16S, 3, 1, 0, cv.BORDER_DEFAULT);
	const abs8 = new cv.Mat();
	cv.convertScaleAbs(lap, abs8);
	lap.delete();
	return abs8;
}

export function matToFrameData(mat: Mat): FrameData {
	const cv = getCV();
	const rgba = new cv.Mat();
	if (mat.type() === cv.CV_8UC4) {
		mat.copyTo(rgba);
	} else if (mat.type() === cv.CV_8UC3) {
		cv.cvtColor(mat, rgba, cv.COLOR_RGB2RGBA);
	} else if (mat.type() === cv.CV_8UC1) {
		cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA);
	} else {
		rgba.delete();
		throw new Error(`unsupported mat type ${mat.type()}`);
	}
	const out: FrameData = {
		width: rgba.cols,
		height: rgba.rows,
		data: new Uint8ClampedArray(rgba.data),
	};
	rgba.delete();
	return out;
}
