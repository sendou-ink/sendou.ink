/**
 * OpenCV 5's 8-bit warpAffine / warpPerspective, reproduced bit for bit:
 * each output pixel is mapped through the f32 inverse matrix and
 * interpolated in f32 (bilinear) or rounded to the nearest source pixel.
 */
import { CANONICAL_HEIGHT, CANONICAL_WIDTH, type Roi } from "./canonical";
import { createImage, type Image } from "./image";
import type { Homography } from "./rectify";
import { roundHalfEven } from "./resize";

export type WarpInterpolation = "linear" | "nearest";

/** Out-of-frame samples: a constant value per channel, or the nearest edge pixel. */
export type WarpBorder = { constant: readonly number[] } | "replicate";

/** Row-major 2x3 affine matrix, source to destination coordinates. */
type AffineMatrix = readonly [number, number, number, number, number, number];

const f = Math.fround;

/** getRotationMatrix2D: rotation by `angleDeg` (counter-clockwise) about `center`, scaled. */
export function rotationMatrix(
	center: { x: number; y: number },
	angleDeg: number,
	scale: number,
): AffineMatrix {
	const angle = angleDeg * (Math.PI / 180);
	const alpha = Math.cos(angle) * scale;
	const beta = Math.sin(angle) * scale;
	const cx = f(center.x);
	const cy = f(center.y);
	return [
		alpha,
		beta,
		(1 - alpha) * cx - beta * cy,
		-beta,
		alpha,
		beta * cx + (1 - alpha) * cy,
	];
}

/** `src` warped by `m` onto a `cols` x `rows` image. */
export function warpAffine(
	src: Image,
	m: AffineMatrix,
	cols: number,
	rows: number,
	interpolation: WarpInterpolation,
	border: WarpBorder,
): Image {
	const inverse = Array.from(invertAffine(m), f);
	return warp(src, cols, rows, interpolation, border, (x, y) => [
		f(f(f(x * inverse[0]!) + f(y * inverse[1]!)) + inverse[2]!),
		f(f(f(x * inverse[3]!) + f(y * inverse[4]!)) + inverse[5]!),
	]);
}

/**
 * `region` of the plane `src` maps onto under `h` (row-major 3x3, source to
 * destination coordinates), as a region-sized image with region.x/y at 0/0.
 * Bilinear; pixels from outside the frame come out black.
 */
export function warpPerspective(src: Image, h: Homography, region: Roi): Image {
	const M = perspectiveInverse(h, region);
	return warp(
		src,
		region.w,
		region.h,
		"linear",
		{ constant: [0, 0, 0, 255] },
		(x, y) => projected(M, x, y),
	);
}

/**
 * `warpPerspective(src, h, region)` computed at the pixels of `rois` (region
 * coordinates) only; every other pixel is left 0. For gates probing a few
 * small ROIs of a large rectified region every frame: the source coordinates
 * and weights are computed once. Sources must be canonical frames; a probe
 * reaching past the frame edge falls back to the full warp.
 */
export function createProbeWarp(
	h: Homography,
	region: Roi,
	rois: readonly Roi[],
): (src: Image) => Image {
	const M = perspectiveInverse(h, region);
	const outOffsets: number[] = [];
	const srcOffsets: number[] = [];
	const alphas: number[] = [];
	const betas: number[] = [];
	let inside = true;
	for (const roi of rois) {
		for (let y = roi.y; y < roi.y + roi.h; y++) {
			for (let x = roi.x; x < roi.x + roi.w; x++) {
				const [sx, sy] = projected(M, x, y);
				const ix = Math.floor(sx);
				const iy = Math.floor(sy);
				if (
					!(ix >= 0 && ix < CANONICAL_WIDTH - 1) ||
					!(iy >= 0 && iy < CANONICAL_HEIGHT - 1)
				) {
					inside = false;
				}
				outOffsets.push((y * region.w + x) * 4);
				srcOffsets.push((iy * CANONICAL_WIDTH + ix) * 4);
				alphas.push(f(sx - ix));
				betas.push(f(sy - iy));
			}
		}
	}
	if (!inside) return (src) => warpPerspective(src, h, region);

	const count = outOffsets.length;
	const outAt = Int32Array.from(outOffsets);
	const srcAt = Int32Array.from(srcOffsets);
	const alpha = Float32Array.from(alphas);
	const beta = Float32Array.from(betas);
	const rowBytes = CANONICAL_WIDTH * 4;
	return (src) => {
		const dst = createImage(region.h, region.w, 4);
		const out = dst.data;
		const pixels = src.data;
		for (let i = 0; i < count; i++) {
			const s = srcAt[i]!;
			const o = outAt[i]!;
			const a = alpha[i]!;
			const b = beta[i]!;
			for (let c = 0; c < 4; c++) {
				const p00 = pixels[s + c]!;
				const p01 = pixels[s + 4 + c]!;
				const p10 = pixels[s + rowBytes + c]!;
				const p11 = pixels[s + rowBytes + 4 + c]!;
				const v0 = f(p00 + f(a * (p01 - p00)));
				const v1 = f(p10 + f(a * (p11 - p10)));
				const v = f(v0 + f(b * f(v1 - v0)));
				// lrintf: half to even (v is within [0, 255])
				let rounded = Math.floor(v + 0.5);
				if (rounded - v === 0.5 && (rounded & 1) === 1) rounded--;
				out[o + c] = rounded;
			}
		}
		return dst;
	};
}

function warp(
	src: Image,
	cols: number,
	rows: number,
	interpolation: WarpInterpolation,
	border: WarpBorder,
	sourceOf: (x: number, y: number) => [number, number],
): Image {
	const { channels: cn, data } = src;
	const dst = createImage(rows, cols, cn);
	const out = dst.data;
	const constant = border === "replicate" ? null : border.constant;
	const sample = (px: number, py: number, c: number): number => {
		if (px >= 0 && px < src.cols && py >= 0 && py < src.rows) {
			return data[(py * src.cols + px) * cn + c]!;
		}
		if (constant) return constant[c] ?? 0;
		const cx = Math.min(Math.max(px, 0), src.cols - 1);
		const cy = Math.min(Math.max(py, 0), src.rows - 1);
		return data[(cy * src.cols + cx) * cn + c]!;
	};
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			const [sx, sy] = sourceOf(x, y);
			const o = (y * cols + x) * cn;
			if (interpolation === "nearest") {
				const ix = roundHalfEven(sx);
				const iy = roundHalfEven(sy);
				for (let c = 0; c < cn; c++) out[o + c] = sample(ix, iy, c);
				continue;
			}
			const ix = Math.floor(sx);
			const iy = Math.floor(sy);
			const a = f(sx - ix);
			const b = f(sy - iy);
			for (let c = 0; c < cn; c++) {
				out[o + c] = bilinear(
					sample(ix, iy, c),
					sample(ix + 1, iy, c),
					sample(ix, iy + 1, c),
					sample(ix + 1, iy + 1, c),
					a,
					b,
				);
			}
		}
	}
	return dst;
}

/** f32 bilinear blend of a 2x2 neighborhood, rounded half to even (lrintf) */
function bilinear(
	p00: number,
	p01: number,
	p10: number,
	p11: number,
	a: number,
	b: number,
): number {
	const v0 = f(p00 + f(a * (p01 - p00)));
	const v1 = f(p10 + f(a * (p11 - p10)));
	const v = f(v0 + f(b * f(v1 - v0)));
	const r = Math.min(255, Math.max(0, roundHalfEven(v)));
	return r;
}

function projected(
	M: readonly number[],
	x: number,
	y: number,
): [number, number] {
	const w = f(f(f(x * M[6]!) + f(y * M[7]!)) + M[8]!);
	return [
		f(f(f(f(x * M[0]!) + f(y * M[1]!)) + M[2]!) / w),
		f(f(f(f(x * M[3]!) + f(y * M[4]!)) + M[5]!) / w),
	];
}

/** The f32 inverse of `h` re-based so `region`'s top-left is the destination origin. */
function perspectiveInverse(h: Homography, region: Roi): number[] {
	return Array.from(invert3x3(regionHomography(h, region)), f);
}

/** cv.invert of a 3x3 matrix (DECOMP_LU takes the explicit cofactor path at this size). */
function invert3x3(m: readonly number[]): number[] {
	const at = (r: number, c: number) => m[r * 3 + c]!;
	const det =
		at(0, 0) * (at(1, 1) * at(2, 2) - at(1, 2) * at(2, 1)) -
		at(0, 1) * (at(1, 0) * at(2, 2) - at(1, 2) * at(2, 0)) +
		at(0, 2) * (at(1, 0) * at(2, 1) - at(1, 1) * at(2, 0));
	const d = det !== 0 ? 1 / det : 0;
	return [
		(at(1, 1) * at(2, 2) - at(1, 2) * at(2, 1)) * d,
		(at(0, 2) * at(2, 1) - at(0, 1) * at(2, 2)) * d,
		(at(0, 1) * at(1, 2) - at(0, 2) * at(1, 1)) * d,
		(at(1, 2) * at(2, 0) - at(1, 0) * at(2, 2)) * d,
		(at(0, 0) * at(2, 2) - at(0, 2) * at(2, 0)) * d,
		(at(0, 2) * at(1, 0) - at(0, 0) * at(1, 2)) * d,
		(at(1, 0) * at(2, 1) - at(1, 1) * at(2, 0)) * d,
		(at(0, 1) * at(2, 0) - at(0, 0) * at(2, 1)) * d,
		(at(0, 0) * at(1, 1) - at(0, 1) * at(1, 0)) * d,
	];
}

/** warpAffine's inversion of a 2x3 matrix */
function invertAffine(m: AffineMatrix): number[] {
	const D0 = m[0] * m[4] - m[1] * m[3];
	const D = D0 !== 0 ? 1 / D0 : 0;
	const a11 = m[4] * D;
	const a22 = m[0] * D;
	const a12 = m[1] * -D;
	const a21 = m[3] * -D;
	const b1 = -a11 * m[2] - a12 * m[5];
	const b2 = -a21 * m[2] - a22 * m[5];
	return [a11, a12, b1, a21, a22, b2];
}

/** `h` re-based so `region`'s top-left is the destination origin (row-major, as warpPerspective takes it). */
function regionHomography(h: Homography, region: Roi): number[] {
	return [
		h[0] - region.x * h[6],
		h[1] - region.x * h[7],
		h[2] - region.x * h[8],
		h[3] - region.y * h[6],
		h[4] - region.y * h[7],
		h[5] - region.y * h[8],
		h[6],
		h[7],
		h[8],
	];
}
