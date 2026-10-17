/** Pure constants/types shared by UI and pipeline; no OpenCV dependency, so the main bundle never pulls in the WASM. */
import * as R from "remeda";

export const CANONICAL_WIDTH = 1920;
export const CANONICAL_HEIGHT = 1080;

/** The smallest rect covering every ROI. */
export function unionRoi(rois: readonly Roi[]): Roi {
	const x = Math.min(...rois.map((r) => r.x));
	const y = Math.min(...rois.map((r) => r.y));
	const right = Math.max(...rois.map((r) => r.x + r.w));
	const bottom = Math.max(...rois.map((r) => r.y + r.h));
	return { x, y, w: right - x, h: bottom - y };
}

export interface Roi {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Mean brightness a bar's outermost line stays under; true black sits at 0-5, video-range black at 16. */
const BORDER_LINE_MAX_MEAN = 20;
/** A bar's lines all sit at one level; dark game UI (the Recent Battles screen's scanline-textured edge, dim scenery) hops or drifts off it. */
const BORDER_LEVEL_TOLERANCE = 2;
/** How deep (fraction of the dimension) a bar's soft inner edge may run past its level part. */
const BORDER_RAMP_FRACTION = 0.01;
/** Each edge line is split into this many segments, so an overlay (webcam, alert box) drawn over part of a bar only hides the segments it covers. */
export const BORDER_SEGMENTS = 16;
/** Segments that must agree on a bar's depth (within BORDER_DEPTH_SPREAD) for it to count. */
const BORDER_MIN_VOTES = 3;
/** How far apart (px) segments' depths of one bar may land: the soft edge reaches deeper next to dark content. */
const BORDER_DEPTH_SPREAD = 2;
/** Shallower dark runs are UI, not bars (the Recent Battles screen's scanline-textured edge runs 1-5px deep at any resolution). */
const BORDER_MIN_FRACTION = 0.01;
/** A dark edge this deep is a fade-to-black or a black screen, not a frame around the game. */
const BORDER_MAX_FRACTION = 0.25;
/** The game always renders 16:9: a cropped box further off than this is dark scenery, so the frame is left alone. */
const CONTENT_ASPECT_TOLERANCE = 0.005;
/** Aspect error worth one segment's vote when choosing between bar depths that both fit. */
const ASPECT_ERROR_PER_VOTE = 0.001;

/** R+G+B summed over segment `segment` of line `line` of an edge, per BORDER_SEGMENTS. */
type SegmentSum = (line: number, segment: number) => number;

/** Per-segment R+G+B sums of every row and column: `rows[y * BORDER_SEGMENTS + s]`, `cols[x * BORDER_SEGMENTS + s]`. */
export interface SegmentSums {
	rows: ArrayLike<number>;
	cols: ArrayLike<number>;
}

/**
 * Finds the game picture inside a capture padded with black bars (letterbox,
 * pillarbox, or an OBS scene drawing the source smaller than the canvas,
 * often with a webcam or alert boxes over part of the frame). Each edge is
 * split into segments and every segment walks inward while it stays dark;
 * segments agreeing on a depth vote for it as that edge's bar, while a
 * segment an overlay covers votes for something else or nothing. Of the
 * depths each edge's votes allow, the combination leaving a 16:9 picture with
 * the most votes wins. Returns null when there is nothing to crop or no
 * combination fits. `rgba` is the frame's pixel data (ImageData layout); cost
 * is proportional to the bars' depth, since a lit outermost segment ends its
 * walk at once.
 */
export function detectContentBox(
	width: number,
	height: number,
	rgba: Uint8Array | Uint8ClampedArray,
): Roi | null {
	const rowSum: SegmentSum = (y, segment) => {
		let sum = 0;
		const rowStart = y * width;
		const end = (rowStart + segmentStart(width, segment + 1)) * 4;
		for (
			let i = (rowStart + segmentStart(width, segment)) * 4;
			i < end;
			i += 4
		) {
			sum += rgba[i] + rgba[i + 1] + rgba[i + 2];
		}
		return sum;
	};
	const colSum: SegmentSum = (x, segment) => {
		let sum = 0;
		const end = segmentStart(height, segment + 1) * width * 4;
		for (
			let i = (segmentStart(height, segment) * width + x) * 4;
			i < end;
			i += width * 4
		) {
			sum += rgba[i] + rgba[i + 1] + rgba[i + 2];
		}
		return sum;
	};
	return contentBoxOfSegments(width, height, rowSum, colSum);
}

/** detectContentBox from every row's and column's per-segment R+G+B sums. */
export function detectContentBoxFromSums(
	width: number,
	height: number,
	sums: SegmentSums,
): Roi | null {
	return contentBoxOfSegments(
		width,
		height,
		(y, segment) => sums.rows[y * BORDER_SEGMENTS + segment],
		(x, segment) => sums.cols[x * BORDER_SEGMENTS + segment],
	);
}

/** First pixel of segment `segment` of a `length`-pixel line. */
function segmentStart(length: number, segment: number): number {
	return Math.floor((segment * length) / BORDER_SEGMENTS);
}

interface BarCandidate {
	depth: number;
	votes: number;
}

function contentBoxOfSegments(
	width: number,
	height: number,
	rowSum: SegmentSum,
	colSum: SegmentSum,
): Roi | null {
	const edge = (
		sum: SegmentSum,
		lineLength: number,
		lineAt: (depth: number) => number,
		dimension: number,
	) =>
		barCandidates(
			segmentDepths(sum, lineLength, lineAt, dimension),
			Math.ceil(dimension * BORDER_MIN_FRACTION),
			Math.floor(dimension * BORDER_MAX_FRACTION),
		);
	const tops = edge(rowSum, width, (d) => d, height);
	const bottoms = edge(rowSum, width, (d) => height - 1 - d, height);
	const lefts = edge(colSum, height, (d) => d, width);
	const rights = edge(colSum, height, (d) => width - 1 - d, width);

	const canonicalAspect = CANONICAL_WIDTH / CANONICAL_HEIGHT;
	let best: { box: Roi; score: number } | null = null;
	for (const top of tops) {
		for (const bottom of bottoms) {
			for (const left of lefts) {
				for (const right of rights) {
					const box = {
						x: left.depth,
						y: top.depth,
						w: width - left.depth - right.depth,
						h: height - top.depth - bottom.depth,
					};
					const aspectError =
						Math.abs(box.w / box.h - canonicalAspect) / canonicalAspect;
					if (aspectError > CONTENT_ASPECT_TOLERANCE) continue;
					const score =
						top.votes +
						bottom.votes +
						left.votes +
						right.votes -
						aspectError / ASPECT_ERROR_PER_VOTE;
					if (!best || score > best.score) best = { box, score };
				}
			}
		}
	}
	if (!best || (best.box.w === width && best.box.h === height)) return null;
	return best.box;
}

/** How many lines deep each segment of an edge is bar, capped at `dimension`'s max bar depth. */
function segmentDepths(
	sum: SegmentSum,
	lineLength: number,
	lineAt: (depth: number) => number,
	dimension: number,
): number[] {
	const maxDepth = Math.floor(dimension * BORDER_MAX_FRACTION);
	const maxRamp = Math.ceil(dimension * BORDER_RAMP_FRACTION);
	return R.times(BORDER_SEGMENTS, (segment) => {
		const pixels =
			3 *
			(segmentStart(lineLength, segment + 1) -
				segmentStart(lineLength, segment));
		const meanAt = (depth: number) => sum(lineAt(depth), segment) / pixels;
		return barDepth(meanAt, maxDepth, maxRamp);
	});
}

/**
 * Lines from the edge that sit at the outermost line's level, extended over
 * the soft inner edge when lit picture follows within `maxRamp` lines (the
 * scaled picture blurs into the bar, and compression rings next to it). Dark
 * picture or scanline texture past the level never lights up that soon.
 */
function barDepth(
	meanAt: (depth: number) => number,
	maxDepth: number,
	maxRamp: number,
): number {
	const level = meanAt(0);
	if (level > BORDER_LINE_MAX_MEAN) return 0;
	let depth = 1;
	while (
		depth < maxDepth &&
		Math.abs(meanAt(depth) - level) <= BORDER_LEVEL_TOLERANCE
	) {
		depth++;
	}
	const rampEnd = Math.min(depth + maxRamp, maxDepth);
	for (let ramp = depth; ramp < rampEnd; ramp++) {
		if (meanAt(ramp) > BORDER_LINE_MAX_MEAN) return ramp;
	}
	return depth;
}

/**
 * The bar depths an edge's segments vote for: each depth several segments
 * reach (give or take a soft edge), plus no bar when at least half the
 * segments are lit right at the edge. A segment short of a bar has an overlay
 * drawn over it; one past it borders dark picture.
 */
function barCandidates(
	depths: number[],
	minDepth: number,
	maxDepth: number,
): BarCandidate[] {
	const candidates: BarCandidate[] = [];
	const unbarred = depths.filter((depth) => depth === 0).length;
	if (unbarred * 2 >= depths.length) {
		candidates.push({ depth: 0, votes: unbarred });
	}
	const byFrequency = R.pipe(
		depths,
		R.filter((depth) => depth >= minDepth && depth < maxDepth),
		R.countBy(String),
		R.entries(),
		R.sortBy(
			[([, count]) => count, "desc"],
			[([depth]) => Number(depth), "asc"],
		),
		R.map(([depth]) => Number(depth)),
	);
	const claimed = new Set<number>();
	for (const depth of byFrequency) {
		if (claimed.has(depth)) continue;
		const near = depths.filter(
			(other) => Math.abs(other - depth) <= BORDER_DEPTH_SPREAD,
		);
		for (const other of near) claimed.add(other);
		if (near.length >= BORDER_MIN_VOTES) {
			candidates.push({ depth, votes: near.length });
		}
	}
	return candidates;
}
