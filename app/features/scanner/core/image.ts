/**
 * Environment-agnostic frame representation: a FrameData is RGBA with the
 * same layout as browser ImageData (Node builds it from @napi-rs/canvas).
 */

import {
	CANONICAL_HEIGHT,
	CANONICAL_WIDTH,
	detectContentBox,
	type Roi,
} from "./canonical";
import { getCV, type Mat, meanOf, minMaxLoc } from "./cv";
import type { Homography } from "./rectify";

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

/**
 * Normalizes any frame to the canonical 1920x1080 RGBA mat all ROI constants
 * assume: black bars around the picture are cropped away first
 * (detectContentBox), then the picture is resized. New mat; caller owns both.
 * `src` must be continuous (a fresh mat, not a ROI view).
 */
export function normalizeFrame(src: Mat): Mat {
	const cv = getCV();
	const dst = new cv.Mat();
	const box = detectContentBox(src.cols, src.rows, src.data as Uint8Array);
	const picture = box ? cropRoi(src, box) : src;
	if (picture.cols === CANONICAL_WIDTH && picture.rows === CANONICAL_HEIGHT) {
		picture.copyTo(dst);
	} else {
		const interpolation =
			picture.cols > CANONICAL_WIDTH ? cv.INTER_AREA : cv.INTER_CUBIC;
		cv.resize(
			picture,
			dst,
			new cv.Size(CANONICAL_WIDTH, CANONICAL_HEIGHT),
			0,
			0,
			interpolation,
		);
	}
	if (box) picture.delete();
	return dst;
}

let conversions: { frame: Mat; gray?: Mat; rgb?: Mat; hsv?: Mat } | null = null;

function conversionsOf(frame: Mat) {
	if (conversions?.frame !== frame) {
		conversions?.gray?.delete();
		conversions?.rgb?.delete();
		conversions?.hsv?.delete();
		conversions = { frame };
	}
	return conversions;
}

/**
 * Grayscale of a canonical frame, shared by every gate and parse that reads
 * the frame: the first caller converts, the rest reuse the mat until a
 * different frame is converted. Read-only; never delete it. Pass only the
 * frame the detectors receive, never a derived mat (that would release the
 * frame's conversions while a parse still reads them).
 */
export function frameGray(frame: Mat): Mat {
	const cached = conversionsOf(frame);
	if (!cached.gray) {
		const cv = getCV();
		cached.gray = new cv.Mat();
		cv.cvtColor(frame, cached.gray, cv.COLOR_RGBA2GRAY);
	}
	return cached.gray;
}

/** RGB of a canonical frame, shared like frameGray. */
export function frameRgb(frame: Mat): Mat {
	const cached = conversionsOf(frame);
	if (!cached.rgb) {
		const cv = getCV();
		cached.rgb = new cv.Mat();
		cv.cvtColor(frame, cached.rgb, cv.COLOR_RGBA2RGB);
	}
	return cached.rgb;
}

/** HSV (from frameRgb) of a canonical frame, shared like frameGray. */
export function frameHsv(frame: Mat): Mat {
	const rgb = frameRgb(frame);
	const cached = conversionsOf(frame);
	if (!cached.hsv) {
		const cv = getCV();
		cached.hsv = new cv.Mat();
		cv.cvtColor(rgb, cached.hsv, cv.COLOR_RGB2HSV);
	}
	return cached.hsv;
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

/**
 * `region` of the plane `src` maps onto under `h` (row-major 3x3, source to
 * destination coordinates), as a region-sized mat with region.x/y at 0/0.
 * Bilinear; pixels from outside the frame come out black.
 */
export function warpPerspective(src: Mat, h: Homography, region: Roi): Mat {
	const cv = getCV();
	const m = cv.matFromArray(3, 3, cv.CV_64F, [
		h[0] - region.x * h[6],
		h[1] - region.x * h[7],
		h[2] - region.x * h[8],
		h[3] - region.y * h[6],
		h[4] - region.y * h[7],
		h[5] - region.y * h[8],
		h[6],
		h[7],
		h[8],
	]);
	const dst = new cv.Mat();
	cv.warpPerspective(
		src,
		dst,
		m,
		new cv.Size(region.w, region.h),
		cv.INTER_LINEAR,
		cv.BORDER_CONSTANT,
		new cv.Scalar(0, 0, 0, 255),
	);
	m.delete();
	return dst;
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
