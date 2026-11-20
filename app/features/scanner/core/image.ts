/**
 * The scanner's images: 8-bit samples in a plain typed array, channels
 * interleaved, rows contiguous (no stride, no views), so any image can be
 * read and written directly and is freed by the garbage collector. A
 * FrameData is RGBA with the same layout as browser ImageData (Node builds
 * it from @napi-rs/canvas). Every operation that OpenCV used to do here
 * reproduces OpenCV's 8-bit output bit for bit (`tests/image-kernel-cases.ts`).
 */

import {
	CANONICAL_HEIGHT,
	CANONICAL_WIDTH,
	detectContentBox,
	type Roi,
} from "./canonical";
import { frameKernels } from "./frame-kernels";
import { resize, roundHalfEven } from "./resize";

export type { Roi };

export interface Image {
	rows: number;
	cols: number;
	/** 1 (gray), 3 (RGB) or 4 (RGBA) */
	channels: number;
	data: Uint8Array;
}

export interface FrameData {
	width: number;
	height: number;
	/** RGBA, 4 bytes per pixel */
	data: Uint8ClampedArray;
}

/** HSV conversion's fixed point (hsv_shift) */
const HSV_SHIFT = 12;

/** A `rows` x `cols` image of `channels` samples per pixel, every sample `fill`. */
export function createImage(
	rows: number,
	cols: number,
	channels: number,
	fill = 0,
): Image {
	const data = new Uint8Array(rows * cols * channels);
	if (fill !== 0) data.fill(fill);
	return { rows, cols, channels, data };
}

/** An RGBA image holding a copy of `frame`'s pixels. */
export function imageFromFrameData(frame: FrameData): Image {
	return {
		rows: frame.height,
		cols: frame.width,
		channels: 4,
		data: new Uint8Array(frame.data),
	};
}

/** RGBA FrameData of any image (gray and RGB get an opaque alpha). */
export function imageToFrameData(image: Image): FrameData {
	return {
		width: image.cols,
		height: image.rows,
		data: new Uint8ClampedArray(toRgba(image).data.buffer),
	};
}

/**
 * Normalizes any frame to the canonical 1920x1080 RGBA image all ROI
 * constants assume: black bars around the picture are cropped away first
 * (detectContentBox), then the picture is resized. A frame needing neither
 * is returned as it is.
 */
export function normalizeFrame(src: Image): Image {
	const box = detectContentBox(src.cols, src.rows, src.data);
	const picture = box ? cropRoi(src, box) : src;
	if (picture.cols === CANONICAL_WIDTH && picture.rows === CANONICAL_HEIGHT) {
		return picture;
	}
	return resize(
		picture,
		CANONICAL_WIDTH,
		CANONICAL_HEIGHT,
		picture.cols > CANONICAL_WIDTH ? "area" : "cubic",
	);
}

let conversions: {
	frame: Image;
	gray?: Image;
	rgb?: Image;
	hsv?: Image;
} | null = null;

function conversionsOf(frame: Image) {
	if (conversions?.frame !== frame) conversions = { frame };
	return conversions;
}

/**
 * Grayscale of a canonical frame, shared by every gate and parse that reads
 * the frame: the first caller converts, the rest reuse the image until a
 * different frame is converted. Read-only: never write to it. Pass only the
 * frame the detectors receive, never a derived image (that would drop the
 * frame's conversions while a parse still reads them).
 */
export function frameGray(frame: Image): Image {
	const cached = conversionsOf(frame);
	cached.gray ??= toGray(frame);
	return cached.gray;
}

/**
 * Hands frameGray the conversion of `frame`, computed elsewhere (the same
 * pixels: the GPU readback's exact kernel), so no caller converts. Call it
 * when the frame's pass begins: it replaces the conversions held for any
 * other frame.
 */
export function provideFrameGray(frame: Image, gray: Uint8Array): void {
	conversionsOf(frame).gray = {
		rows: frame.rows,
		cols: frame.cols,
		channels: 1,
		data: gray,
	};
}

/** RGB of a canonical frame, shared like frameGray. */
export function frameRgb(frame: Image): Image {
	const cached = conversionsOf(frame);
	cached.rgb ??= toRgb(frame);
	return cached.rgb;
}

/** HSV (from frameRgb) of a canonical frame, shared like frameGray. */
export function frameHsv(frame: Image): Image {
	const rgb = frameRgb(frame);
	const cached = conversionsOf(frame);
	cached.hsv ??= rgbToHsv(rgb);
	return cached.hsv;
}

/** A copy of `roi` of `src`. */
export function cropRoi(src: Image, roi: Roi): Image {
	const { channels } = src;
	const out = createImage(roi.h, roi.w, channels);
	const rowBytes = roi.w * channels;
	for (let y = 0; y < roi.h; y++) {
		const start = ((roi.y + y) * src.cols + roi.x) * channels;
		out.data.set(src.data.subarray(start, start + rowBytes), y * rowBytes);
	}
	return out;
}

/**
 * Mean brightness of a ROI: average of the first three channels on a color
 * image, the single channel's mean on grayscale. The shared gate probe.
 */
export function meanBrightness(image: Image, roi: Roi): number {
	const { channels, data } = image;
	let r = 0;
	let g = 0;
	let b = 0;
	for (let y = roi.y; y < roi.y + roi.h; y++) {
		const start = (y * image.cols + roi.x) * channels;
		const end = start + roi.w * channels;
		if (channels === 1) {
			for (let i = start; i < end; i++) r += data[i]!;
			continue;
		}
		for (let i = start; i < end; i += channels) {
			r += data[i]!;
			g += data[i + 1]!;
			b += data[i + 2]!;
		}
	}
	// cv.mean scales by the reciprocal of the count
	const scale = 1 / (roi.w * roi.h);
	return channels >= 3 ? (r * scale + g * scale + b * scale) / 3 : r * scale;
}

/** Brightest sample of a grayscale ROI (default: the whole image). */
export function maxBrightness(
	gray: Image,
	roi: Roi = { x: 0, y: 0, w: gray.cols, h: gray.rows },
): number {
	let max = 0;
	for (let y = roi.y; y < roi.y + roi.h; y++) {
		const start = y * gray.cols + roi.x;
		for (let i = start; i < start + roi.w; i++) {
			if (gray.data[i]! > max) max = gray.data[i]!;
		}
	}
	return max;
}

/** Brightest channel per pixel, so colored text binarizes like white. */
export function maxChannel(image: Image, roi?: Roi): Image {
	return channelExtreme(image, roi, Math.max);
}

/** Per-pixel min of R/G/B — drops color-tinted brightness, keeps white. */
export function minChannel(image: Image, roi?: Roi): Image {
	return channelExtreme(image, roi, Math.min);
}

/** One channel of a color image as a gray image. */
export function channelOf(image: Image, channel: number): Image {
	const n = image.rows * image.cols;
	const out = createImage(image.rows, image.cols, 1);
	for (let i = 0; i < n; i++) {
		out.data[i] = image.data[i * image.channels + channel]!;
	}
	return out;
}

/**
 * Coarse content fingerprint of a grayscale ROI: mean brightness per cell of a
 * cols x rows grid. Consecutive frames of one static screen move a cell by
 * ≤~2 while different content moves cells by tens (measured on battle log
 * browsing) — the scheduler compares fingerprints to re-arm suppression when
 * a passing gate's screen flips to a new occurrence (GateResult.signature).
 */
export function roiSignature(
	gray: Image,
	roi: Roi,
	cols: number,
	rows: number,
): number[] {
	return Array.from(resize(cropRoi(gray, roi), cols, rows, "area").data);
}

/** THRESH_BINARY to 255 (`inverse`: THRESH_BINARY_INV), per sample. */
export function threshold(src: Image, thresh: number, inverse = false): Image {
	const out = createImage(src.rows, src.cols, src.channels);
	const on = inverse ? 0 : 255;
	const off = 255 - on;
	const { data } = src;
	for (let i = 0; i < data.length; i++) {
		out.data[i] = data[i]! > thresh ? on : off;
	}
	return out;
}

/** Number of non-zero samples of a single-channel image. */
export function countNonZero(image: Image): number {
	const { data } = image;
	let count = 0;
	for (let i = 0; i < data.length; i++) if (data[i] !== 0) count++;
	return count;
}

/** `src` where `mask` is non-zero, 0 elsewhere (copyTo onto zeros with a mask). */
export function applyMask(src: Image, mask: Image): Image {
	const out = createImage(src.rows, src.cols, src.channels);
	const { channels } = src;
	const n = src.rows * src.cols;
	for (let i = 0; i < n; i++) {
		if (mask.data[i] === 0) continue;
		for (let c = 0; c < channels; c++) {
			out.data[i * channels + c] = src.data[i * channels + c]!;
		}
	}
	return out;
}

/** Zeroes `image` (single channel) wherever `mask` is non-zero, in place (setTo with a mask). */
export function clearMasked(image: Image, mask: Image): void {
	for (let i = 0; i < image.data.length; i++) {
		if (mask.data[i] !== 0) image.data[i] = 0;
	}
}

/** COLOR_RGBA2GRAY / COLOR_RGB2GRAY (a gray image is copied). */
export function toGray(src: Image): Image {
	if (src.channels === 1) return { ...src, data: src.data.slice() };
	const kernels = src.channels === 4 ? frameKernels() : null;
	if (kernels) return kernels.rgbaToGray(src);
	const n = src.rows * src.cols;
	const out = createImage(src.rows, src.cols, 1);
	const { channels, data } = src;
	for (let i = 0; i < n; i++) {
		const p = i * channels;
		out.data[i] =
			(data[p]! * 9798 + data[p + 1]! * 19235 + data[p + 2]! * 3735 + 16384) >>
			15;
	}
	return out;
}

/** COLOR_RGBA2RGB (an RGB image is copied). */
export function toRgb(src: Image): Image {
	if (src.channels === 3) return { ...src, data: src.data.slice() };
	if (src.channels !== 4) throw new Error(`no RGB of ${src.channels} channels`);
	const kernels = frameKernels();
	if (kernels) return kernels.rgbaToRgb(src);
	const n = src.rows * src.cols;
	const out = createImage(src.rows, src.cols, 3);
	for (let i = 0; i < n; i++) {
		out.data[i * 3] = src.data[i * 4]!;
		out.data[i * 3 + 1] = src.data[i * 4 + 1]!;
		out.data[i * 3 + 2] = src.data[i * 4 + 2]!;
	}
	return out;
}

/**
 * COLOR_RGB2HSV: H in 0..180, OpenCV's 12-bit fixed point.
 * @internal
 */
export function rgbToHsv(rgb: Image): Image {
	const { sdiv, hdiv } = hsvTables();
	const n = rgb.rows * rgb.cols;
	const out = createImage(rgb.rows, rgb.cols, 3);
	const kernels = rgb.channels === 3 ? frameKernels() : null;
	if (kernels) {
		kernels.rgbToHsv(rgb, out, sdiv, hdiv);
		return out;
	}
	const src = rgb.data;
	const dst = out.data;
	const half = 1 << (HSV_SHIFT - 1);
	for (let i = 0; i < n; i++) {
		const p = i * rgb.channels;
		const r = src[p]!;
		const g = src[p + 1]!;
		const b = src[p + 2]!;
		const v = Math.max(r, g, b);
		const diff = v - Math.min(r, g, b);
		const s = (diff * sdiv[v]! + half) >> HSV_SHIFT;
		let h = v === r ? g - b : v === g ? b - r + 2 * diff : r - g + 4 * diff;
		h = (h * hdiv[diff]! + half) >> HSV_SHIFT;
		if (h < 0) h += 180;
		dst[i * 3] = h;
		dst[i * 3 + 1] = s;
		dst[i * 3 + 2] = v;
	}
	return out;
}

let hsvTableCache: { sdiv: Int32Array; hdiv: Int32Array } | null = null;

function hsvTables() {
	if (hsvTableCache) return hsvTableCache;
	const sdiv = new Int32Array(256);
	const hdiv = new Int32Array(256);
	for (let i = 1; i < 256; i++) {
		sdiv[i] = roundHalfEven((255 << HSV_SHIFT) / i);
		hdiv[i] = roundHalfEven((180 << HSV_SHIFT) / (6 * i));
	}
	hsvTableCache = { sdiv, hdiv };
	return hsvTableCache;
}

function channelExtreme(
	image: Image,
	roi: Roi | undefined,
	pick: (a: number, b: number, c: number) => number,
): Image {
	const src = roi ? cropRoi(image, roi) : image;
	const n = src.rows * src.cols;
	const out = createImage(src.rows, src.cols, 1);
	const { channels, data } = src;
	for (let i = 0; i < n; i++) {
		const p = i * channels;
		out.data[i] = pick(data[p]!, data[p + 1]!, data[p + 2]!);
	}
	return out;
}

/** COLOR_GRAY2RGBA / COLOR_RGB2RGBA (opaque alpha; an RGBA image is copied). */
function toRgba(src: Image): Image {
	if (src.channels === 4) return { ...src, data: src.data.slice() };
	const n = src.rows * src.cols;
	const out = createImage(src.rows, src.cols, 4, 255);
	for (let i = 0; i < n; i++) {
		for (let c = 0; c < 3; c++) {
			out.data[i * 4 + c] =
				src.data[src.channels === 1 ? i : i * src.channels + c]!;
		}
	}
	return out;
}
