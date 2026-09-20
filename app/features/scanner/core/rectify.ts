/**
 * Plane rectification for screens drawn in perspective (the lobby's quick
 * battle log card is yawed a few degrees): a homography from four point
 * correspondences. Pure math, so the debug views can map ROIs back onto the
 * raw frame without OpenCV; the warp itself is image.ts's warpPerspective.
 */
import type { Roi } from "./canonical";

export type Point = readonly [number, number];

/** Four source points and where each lands; no three may be collinear. */
export interface PerspectiveQuad {
	from: readonly [Point, Point, Point, Point];
	to: readonly [Point, Point, Point, Point];
}

/** Row-major 3x3 projective matrix, normalized to a last entry of 1. */
export type Homography = readonly [
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
];

/** The homography mapping `quad.from` onto `quad.to` (direct linear transform, 8 unknowns). */
export function homographyFromQuad(quad: PerspectiveQuad): Homography {
	const rows: number[][] = [];
	for (let i = 0; i < 4; i++) {
		const [x, y] = quad.from[i]!;
		const [u, v] = quad.to[i]!;
		rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
		rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
	}
	const h = solveLinear(rows);
	return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function invertHomography(m: Homography): Homography {
	const adjugate = [
		m[4] * m[8] - m[5] * m[7],
		m[2] * m[7] - m[1] * m[8],
		m[1] * m[5] - m[2] * m[4],
		m[5] * m[6] - m[3] * m[8],
		m[0] * m[8] - m[2] * m[6],
		m[2] * m[3] - m[0] * m[5],
		m[3] * m[7] - m[4] * m[6],
		m[1] * m[6] - m[0] * m[7],
		m[0] * m[4] - m[1] * m[3],
	];
	const scale = adjugate[8]!;
	return adjugate.map((v) => v / scale) as unknown as Homography;
}

export function projectPoint(h: Homography, [x, y]: Point): Point {
	const w = h[6] * x + h[7] * y + h[8];
	return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

/** The ROI's corners mapped through `h`, clockwise from the top-left. */
export function projectRoi(
	h: Homography,
	roi: Roi,
): [Point, Point, Point, Point] {
	return [
		projectPoint(h, [roi.x, roi.y]),
		projectPoint(h, [roi.x + roi.w, roi.y]),
		projectPoint(h, [roi.x + roi.w, roi.y + roi.h]),
		projectPoint(h, [roi.x, roi.y + roi.h]),
	];
}

/** The axis-aligned box around the ROI's projected corners, rounded outward. */
export function projectedBounds(h: Homography, roi: Roi): Roi {
	const corners = projectRoi(h, roi);
	const x = Math.floor(Math.min(...corners.map((c) => c[0])));
	const y = Math.floor(Math.min(...corners.map((c) => c[1])));
	const right = Math.ceil(Math.max(...corners.map((c) => c[0])));
	const bottom = Math.ceil(Math.max(...corners.map((c) => c[1])));
	return { x, y, w: right - x, h: bottom - y };
}

/** Gaussian elimination with partial pivoting over augmented rows [a0..an-1 | b]. */
function solveLinear(rows: number[][]): number[] {
	const n = rows.length;
	for (let col = 0; col < n; col++) {
		let pivot = col;
		for (let r = col + 1; r < n; r++) {
			if (Math.abs(rows[r]![col]!) > Math.abs(rows[pivot]![col]!)) pivot = r;
		}
		[rows[col], rows[pivot]] = [rows[pivot]!, rows[col]!];
		const lead = rows[col]![col]!;
		if (lead === 0) throw new Error("degenerate quad: no homography");
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const factor = rows[r]![col]! / lead;
			if (factor === 0) continue;
			for (let c = col; c <= n; c++) rows[r]![c]! -= factor * rows[col]![c]!;
		}
	}
	return rows.map((row, i) => row[n]! / row[i]!);
}
