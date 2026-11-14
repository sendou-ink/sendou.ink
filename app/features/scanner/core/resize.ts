/**
 * OpenCV's 8-bit `resize`, reproduced bit for bit (the scanner's ROI
 * constants, glyph atlases and fixtures were all tuned on its output): the
 * same coefficient tables in f32, the same fixed-point passes and rounding.
 * Checked against OpenCV.js 5.0.0 before it was dropped
 * (`tests/image-kernel-cases.ts` pins those outputs).
 */
import { type AreaTaps, frameKernels } from "./frame-kernels";
import { createImage, type Image } from "./image";

export type Interpolation = "nearest" | "linear" | "cubic" | "area";

/** INTER_RESIZE_COEF_SCALE: fixed-point coefficients carry 11 fraction bits */
const COEF_SCALE = 2048;

/** Resizes reading and writing this many samples or more run in frame-kernels.c; smaller ones in JS */
const KERNEL_MIN_SAMPLES = 1 << 16;

const f = Math.fround;

/** `src` resized to `cols` x `rows` (cv.resize with a destination size). */
export function resize(
	src: Image,
	cols: number,
	rows: number,
	interpolation: Interpolation,
): Image {
	return resizeWith(
		src,
		cols,
		rows,
		cols / src.cols,
		rows / src.rows,
		interpolation,
	);
}

/**
 * `src` scaled by `fx` x `fy` (cv.resize with an empty destination size):
 * the size is rounded, and the coefficients follow the factors, not the size.
 */
export function resizeBy(
	src: Image,
	fx: number,
	fy: number,
	interpolation: Interpolation,
): Image {
	return resizeWith(
		src,
		roundHalfEven(src.cols * fx),
		roundHalfEven(src.rows * fy),
		fx,
		fy,
		interpolation,
	);
}

/**
 * OpenCV's cubic coefficient table for one axis: per destination index the
 * source index `floor(fx)` and four fixed-point weights.
 */
export function cubicTable(srcSize: number, dstSize: number): number[] {
	const invScale = dstSize / srcSize;
	const { offsets, weights } = axisTable(
		srcSize,
		dstSize,
		{ scale: 1 / invScale, invScale },
		"cubic",
		false,
	);
	return Array.from(offsets).flatMap((sx, d) => [
		sx,
		...weights.subarray(d * 4, d * 4 + 4),
	]);
}

/** lrint in the default rounding mode, as OpenCV's cvRound compiles under clang */
export function roundHalfEven(v: number): number {
	const r = Math.round(v);
	return r - v === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

function resizeWith(
	src: Image,
	cols: number,
	rows: number,
	invScaleX: number,
	invScaleY: number,
	interpolation: Interpolation,
): Image {
	if (cols === src.cols && rows === src.rows) {
		return { ...src, data: src.data.slice() };
	}
	const scaleX = 1 / invScaleX;
	const scaleY = 1 / invScaleY;
	if (interpolation === "nearest") {
		return resizeNearest(src, cols, rows, scaleX, scaleY);
	}
	const iscaleX = roundHalfEven(scaleX);
	const iscaleY = roundHalfEven(scaleY);
	const isAreaFast =
		Math.abs(scaleX - iscaleX) < Number.EPSILON &&
		Math.abs(scaleY - iscaleY) < Number.EPSILON;
	let mode = interpolation;
	if (mode === "linear" && isAreaFast && iscaleX === 2 && iscaleY === 2) {
		mode = "area";
	}
	if (mode === "area" && scaleX >= 1 && scaleY >= 1) {
		return isAreaFast
			? resizeAreaFast(src, cols, rows, iscaleX, iscaleY)
			: resizeArea(src, cols, rows, scaleX, scaleY);
	}
	return resizeSeparable(
		src,
		cols,
		rows,
		{ scale: scaleX, invScale: invScaleX },
		{ scale: scaleY, invScale: invScaleY },
		mode,
	);
}

function resizeNearest(
	src: Image,
	cols: number,
	rows: number,
	scaleX: number,
	scaleY: number,
): Image {
	const { channels: cn } = src;
	const dst = createImage(rows, cols, cn);
	for (let y = 0; y < rows; y++) {
		const sy = Math.min(Math.floor(y * scaleY), src.rows - 1);
		for (let x = 0; x < cols; x++) {
			const sx = Math.min(Math.floor(x * scaleX), src.cols - 1);
			const s = (sy * src.cols + sx) * cn;
			const d = (y * cols + x) * cn;
			for (let c = 0; c < cn; c++) dst.data[d + c] = src.data[s + c]!;
		}
	}
	return dst;
}

/** resizeAreaFast_: integer scales, each output the mean of its source block */
function resizeAreaFast(
	src: Image,
	cols: number,
	rows: number,
	scaleX: number,
	scaleY: number,
): Image {
	const { channels: cn } = src;
	const dst = createImage(rows, cols, cn);
	const area = scaleX * scaleY;
	const scale = f(1 / area);
	const srcStep = src.cols * cn;
	const width = cols * cn;
	const blockWidth = Math.floor(src.cols / scaleX) * cn;
	// OpenCV's 2x2 path rounds half up; every other scale rounds the f32 mean to even
	const halfUp = scaleX === 2 && scaleY === 2 && cn !== 2;
	const offsets = new Int32Array(area);
	for (let sy = 0, k = 0; sy < scaleY; sy++) {
		for (let sx = 0; sx < scaleX; sx++) offsets[k++] = sy * srcStep + sx * cn;
	}
	// source element of each destination element's block corner
	const corner = new Int32Array(width);
	for (let dx = 0; dx < cols; dx++) {
		for (let c = 0; c < cn; c++) corner[dx * cn + c] = scaleX * dx * cn + c;
	}
	const s = src.data;
	const d = dst.data;
	const kernels = halfUp ? largeKernels(src, dst) : null;
	const kernelRows = Math.min(rows, Math.floor(src.rows / 2));
	kernels?.resizeHalf(src, dst, kernelRows, blockWidth);
	for (let dy = 0; dy < rows; dy++) {
		const sy0 = dy * scaleY;
		const rowStart = dy * width;
		if (sy0 >= src.rows) continue;
		const whole = sy0 + scaleY <= src.rows ? blockWidth : 0;
		const base = sy0 * srcStep;
		let dx = kernels && dy < kernelRows ? whole : 0;
		if (halfUp) {
			for (; dx < whole; dx++) {
				const at = base + corner[dx]!;
				d[rowStart + dx] =
					(s[at]! +
						s[at + cn]! +
						s[at + srcStep]! +
						s[at + srcStep + cn]! +
						2) >>
					2;
			}
		} else {
			for (; dx < whole; dx++) {
				const at = base + corner[dx]!;
				let sum = 0;
				for (let k = 0; k < area; k++) sum += s[at + offsets[k]!]!;
				d[rowStart + dx] = saturateU8(roundHalfEven(f(sum * scale)));
			}
		}
		for (; dx < width; dx++) {
			const sx0 = corner[dx]!;
			let sum = 0;
			let count = 0;
			for (let sy = 0; sy < scaleY; sy++) {
				if (sy0 + sy >= src.rows) break;
				const row = (sy0 + sy) * srcStep + sx0;
				for (let sx = 0; sx < scaleX * cn; sx += cn) {
					if (sx0 + sx >= srcStep) break;
					sum += s[row + sx]!;
					count++;
				}
			}
			d[rowStart + dx] = saturateU8(roundHalfEven(f(sum / count)));
		}
	}
	return dst;
}

/** resizeArea_: fractional downscales, f32 sums of the source pixels each output covers */
function resizeArea(
	src: Image,
	cols: number,
	rows: number,
	scaleX: number,
	scaleY: number,
): Image {
	const { channels: cn } = src;
	const dst = createImage(rows, cols, cn);
	const xtab = areaTable(src.cols, cols, cn, scaleX);
	const ytab = areaTable(src.rows, rows, 1, scaleY);
	const kernels = largeKernels(src, dst);
	if (kernels) {
		kernels.resizeArea(src, dst, xtab, ytab);
		return dst;
	}
	const width = cols * cn;
	const buf = new Float32Array(width);
	const sum = new Float32Array(width);
	const s = src.data;
	const d = dst.data;
	const srcStep = src.cols * cn;
	const flush = (dy: number) => {
		const rowStart = dy * width;
		for (let dx = 0; dx < width; dx++) {
			d[rowStart + dx] = saturateU8(roundHalfEven(sum[dx]!));
		}
	};
	let prevDy = ytab.di[0]!;
	for (let j = 0; j < ytab.length; j++) {
		const dy = ytab.di[j]!;
		const beta = ytab.alpha[j]!;
		const rowStart = ytab.si[j]! * srcStep;
		buf.fill(0);
		for (let k = 0; k < xtab.length; k++) {
			const di = xtab.di[k]!;
			const si = rowStart + xtab.si[k]!;
			const alpha = xtab.alpha[k]!;
			for (let c = 0; c < cn; c++) {
				buf[di + c] = buf[di + c]! + f(s[si + c]! * alpha);
			}
		}
		if (dy !== prevDy) {
			flush(prevDy);
			for (let dx = 0; dx < width; dx++) sum[dx] = beta * buf[dx]!;
			prevDy = dy;
		} else {
			for (let dx = 0; dx < width; dx++) {
				sum[dx] = sum[dx]! + f(beta * buf[dx]!);
			}
		}
	}
	flush(prevDy);
	return dst;
}

/** computeResizeAreaTab */
function areaTable(
	srcSize: number,
	dstSize: number,
	cn: number,
	scale: number,
): AreaTaps {
	const di: number[] = [];
	const si: number[] = [];
	const alpha: number[] = [];
	const push = (d: number, s: number, a: number) => {
		di.push(d * cn);
		si.push(s * cn);
		alpha.push(a);
	};
	for (let dx = 0; dx < dstSize; dx++) {
		const fsx1 = dx * scale;
		const fsx2 = fsx1 + scale;
		const cellWidth = Math.min(scale, srcSize - fsx1);
		let sx1 = Math.ceil(fsx1);
		let sx2 = Math.floor(fsx2);
		sx2 = Math.min(sx2, srcSize - 1);
		sx1 = Math.min(sx1, sx2);
		if (sx1 - fsx1 > 1e-3) push(dx, sx1 - 1, (sx1 - fsx1) / cellWidth);
		for (let sx = sx1; sx < sx2; sx++) push(dx, sx, 1 / cellWidth);
		if (fsx2 - sx2 > 1e-3) {
			push(dx, sx2, Math.min(Math.min(fsx2 - sx2, 1), cellWidth) / cellWidth);
		}
	}
	return {
		length: di.length,
		di: Int32Array.from(di),
		si: Int32Array.from(si),
		alpha: Float32Array.from(alpha),
	};
}

interface AxisScale {
	scale: number;
	invScale: number;
}

interface AxisTable {
	/** source index of each destination index's first tap, unclamped */
	offsets: Int32Array;
	/** ksize fixed-point weights per destination index */
	weights: Int16Array;
}

/**
 * resizeGeneric_ for 8 bits: a horizontal pass of integer sums per source
 * row, then a vertical fixed-point combine. INTER_AREA upscales run here
 * with OpenCV's area-style linear coefficients.
 */
function resizeSeparable(
	src: Image,
	cols: number,
	rows: number,
	xScale: AxisScale,
	yScale: AxisScale,
	mode: "linear" | "cubic" | "area",
): Image {
	const { channels: cn } = src;
	const ksize = mode === "cubic" ? 4 : 2;
	const x = axisTable(src.cols, cols, xScale, mode, true);
	const y = axisTable(src.rows, rows, yScale, mode, false);
	const dst = createImage(rows, cols, cn);
	const width = cols * cn;
	const srcStep = src.cols * cn;
	const s = src.data;
	const d = dst.data;

	// per destination element: the source element of every tap (edge-clamped) and its weight
	const tapAt = new Int32Array(width * ksize);
	const tapWeight = new Int32Array(width * ksize);
	for (let dx = 0; dx < cols; dx++) {
		for (let c = 0; c < cn; c++) {
			const element = (dx * cn + c) * ksize;
			for (let k = 0; k < ksize; k++) {
				const px = Math.min(
					Math.max(x.offsets[dx]! + k - (ksize / 2 - 1), 0),
					src.cols - 1,
				);
				tapAt[element + k] = px * cn + c;
				tapWeight[element + k] = x.weights[dx * ksize + k]!;
			}
		}
	}

	const rowsOf = new Int32Array(rows * ksize);
	for (let dy = 0; dy < rows; dy++) {
		for (let k = 0; k < ksize; k++) {
			rowsOf[dy * ksize + k] = clip(
				y.offsets[dy]! - ksize / 2 + 1 + k,
				0,
				src.rows,
			);
		}
	}
	const kernels = largeKernels(src, dst);
	if (kernels) {
		kernels.resizeSeparable(src, dst, {
			ksize,
			tapAt,
			tapWeight,
			rowsOf,
			yWeight: Int32Array.from(y.weights),
		});
		return dst;
	}

	const horizontalRow = (sy: number, out: Int32Array) => {
		const rowStart = sy * srcStep;
		if (ksize === 4) {
			for (let i = 0, t = 0; i < width; i++, t += 4) {
				out[i] =
					s[rowStart + tapAt[t]!]! * tapWeight[t]! +
					s[rowStart + tapAt[t + 1]!]! * tapWeight[t + 1]! +
					s[rowStart + tapAt[t + 2]!]! * tapWeight[t + 2]! +
					s[rowStart + tapAt[t + 3]!]! * tapWeight[t + 3]!;
			}
		} else {
			for (let i = 0, t = 0; i < width; i++, t += 2) {
				out[i] =
					s[rowStart + tapAt[t]!]! * tapWeight[t]! +
					s[rowStart + tapAt[t + 1]!]! * tapWeight[t + 1]!;
			}
		}
	};

	// rows of horizontal sums by source row; source rows only move down, so
	// rows above the current window are recycled
	const cachedRows: number[] = [];
	const cachedBuffers: Int32Array[] = [];
	const spare: Int32Array[] = [];
	const sourceRows: Int32Array[] = new Array(ksize);
	for (let dy = 0; dy < rows; dy++) {
		const first = rowsOf[dy * ksize]!;
		for (let i = cachedRows.length - 1; i >= 0; i--) {
			if (cachedRows[i]! < first) {
				spare.push(cachedBuffers[i]!);
				cachedRows.splice(i, 1);
				cachedBuffers.splice(i, 1);
			}
		}
		for (let k = 0; k < ksize; k++) {
			const sy = rowsOf[dy * ksize + k]!;
			let at = cachedRows.indexOf(sy);
			if (at === -1) {
				const buffer = spare.pop() ?? new Int32Array(width);
				horizontalRow(sy, buffer);
				at = cachedRows.push(sy) - 1;
				cachedBuffers.push(buffer);
			}
			sourceRows[k] = cachedBuffers[at]!;
		}
		const beta = dy * ksize;
		const rowStart = dy * width;
		if (ksize === 4) {
			const r0 = sourceRows[0]!;
			const r1 = sourceRows[1]!;
			const r2 = sourceRows[2]!;
			const r3 = sourceRows[3]!;
			const b0 = y.weights[beta]!;
			const b1 = y.weights[beta + 1]!;
			const b2 = y.weights[beta + 2]!;
			const b3 = y.weights[beta + 3]!;
			for (let i = 0; i < width; i++) {
				const v =
					(r0[i]! * b0 + r1[i]! * b1 + r2[i]! * b2 + r3[i]! * b3 + 2097152) >>
					22;
				d[rowStart + i] = saturateU8(v);
			}
		} else {
			const r0 = sourceRows[0]!;
			const r1 = sourceRows[1]!;
			const b0 = y.weights[beta]!;
			const b1 = y.weights[beta + 1]!;
			for (let i = 0; i < width; i++) {
				d[rowStart + i] =
					(((b0 * (r0[i]! >> 4)) >> 16) + ((b1 * (r1[i]! >> 4)) >> 16) + 2) >>
					2;
			}
		}
	}
	return dst;
}

function axisTable(
	srcSize: number,
	dstSize: number,
	{ scale, invScale }: AxisScale,
	mode: "linear" | "cubic" | "area",
	clampTaps: boolean,
): AxisTable {
	const ksize = mode === "cubic" ? 4 : 2;
	const offsets = new Int32Array(dstSize);
	const weights = new Int16Array(dstSize * ksize);
	for (let d = 0; d < dstSize; d++) {
		let sx: number;
		let fx: number;
		if (mode === "area") {
			sx = Math.floor(d * scale);
			fx = f(d + 1 - (sx + 1) * invScale);
			fx = fx <= 0 ? 0 : f(fx - Math.floor(fx));
		} else {
			fx = f((d + 0.5) * scale - 0.5);
			sx = Math.floor(fx);
			fx = f(fx - sx);
		}
		if (clampTaps && mode !== "cubic") {
			if (sx < 0) {
				fx = 0;
				sx = 0;
			}
			if (sx >= srcSize - 1) {
				fx = 0;
				sx = srcSize - 1;
			}
		}
		offsets[d] = sx;
		const coefficients = mode === "cubic" ? cubicWeights(fx) : [f(1 - fx), fx];
		for (let k = 0; k < ksize; k++) {
			weights[d * ksize + k] = fixedPoint(coefficients[k]!);
		}
	}
	return { offsets, weights };
}

/** interpolateCubic, A = -0.75, in f32 steps */
function cubicWeights(fx: number): [number, number, number, number] {
	const A = f(-0.75);
	const x1 = f(fx + 1);
	const c0 = f(
		f(f(f(f(f(A * x1) - f(5 * A)) * x1) + f(8 * A)) * x1) - f(4 * A),
	);
	const c1 = f(f(f(f(f(f(A + 2) * fx) - f(A + 3)) * fx) * fx) + 1);
	const omx = f(1 - fx);
	const c2 = f(f(f(f(f(f(A + 2) * omx) - f(A + 3)) * omx) * omx) + 1);
	const c3 = f(f(f(1 - c0) - c1) - c2);
	return [c0, c1, c2, c3];
}

/** saturate_cast<short>(c * INTER_RESIZE_COEF_SCALE) */
function fixedPoint(c: number): number {
	return Math.max(-32768, Math.min(32767, roundHalfEven(f(c * COEF_SCALE))));
}

function largeKernels(src: Image, dst: Image) {
	return src.data.length + dst.data.length >= KERNEL_MIN_SAMPLES
		? frameKernels()
		: null;
}

function clip(v: number, lo: number, hi: number): number {
	return v >= lo ? (v < hi ? v : hi - 1) : lo;
}

function saturateU8(v: number): number {
	return Math.min(255, Math.max(0, v));
}
