/** Pure constants/types shared by UI and pipeline; no OpenCV dependency, so the main bundle never pulls in the WASM. */
export const CANONICAL_WIDTH = 1920;
export const CANONICAL_HEIGHT = 1080;

export interface Roi {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Mean brightness an edge row/column stays under to count as bar; true black sits at 0-5, video-range black at 16. */
const BORDER_LINE_MAX_MEAN = 20;
/** A bar's lines all sit at one level; the Recent Battles screen's scanline-textured edge is dark but hops several levels line to line. */
const BORDER_LEVEL_TOLERANCE = 2;
/** Shallower dark runs are UI, not bars (that same scanline edge runs 1-5px deep at any resolution). */
const BORDER_MIN_FRACTION = 0.01;
/** A dark edge deeper than this fraction of the dimension is a fade-to-black or a black screen, not a frame around the game. */
const BORDER_MAX_FRACTION = 0.25;
/** The game always renders 16:9: a cropped box further off than this is dark scenery, so the frame is left alone. */
const CONTENT_ASPECT_TOLERANCE = 0.01;

/**
 * Finds the game picture inside a capture padded with black bars (letterbox,
 * pillarbox, or an OBS scene drawing the source slightly smaller than the
 * canvas — 1920x1080 with a 16px/29px frame of black seen live). Walks each
 * edge inward while the whole row/column stays dark at the first line's
 * level, keeps a side only when the run is deep enough to be a bar, and
 * accepts the box only when the remaining picture is 16:9 and no bar is
 * absurdly deep. Returns null when there is nothing to crop. `rgba` is the
 * frame's pixel data (ImageData layout); cost is proportional to the bars'
 * depth, since a lit outermost line ends the walk at once.
 */
export function detectContentBox(
	width: number,
	height: number,
	rgba: Uint8Array | Uint8ClampedArray,
): Roi | null {
	const rowMean = (y: number) => {
		let sum = 0;
		const end = (y * width + width) * 4;
		for (let i = y * width * 4; i < end; i += 4) {
			sum += rgba[i]! + rgba[i + 1]! + rgba[i + 2]!;
		}
		return sum / (width * 3);
	};
	const colMean = (x: number) => {
		let sum = 0;
		for (let i = x * 4; i < rgba.length; i += width * 4) {
			sum += rgba[i]! + rgba[i + 1]! + rgba[i + 2]!;
		}
		return sum / (height * 3);
	};
	const barDepth = (
		lineMean: (line: number) => number,
		lineAt: (depth: number) => number,
		maxDepth: number,
		minDepth: number,
	): number => {
		const level = lineMean(lineAt(0));
		if (level > BORDER_LINE_MAX_MEAN) return 0;
		let depth = 1;
		while (
			depth < maxDepth &&
			Math.abs(lineMean(lineAt(depth)) - level) <= BORDER_LEVEL_TOLERANCE
		) {
			depth++;
		}
		return depth >= minDepth ? depth : 0;
	};
	const maxDepthY = Math.floor(height * BORDER_MAX_FRACTION);
	const maxDepthX = Math.floor(width * BORDER_MAX_FRACTION);
	const minDepthY = Math.ceil(height * BORDER_MIN_FRACTION);
	const minDepthX = Math.ceil(width * BORDER_MIN_FRACTION);

	const top = barDepth(rowMean, (d) => d, maxDepthY, minDepthY);
	const bottom = barDepth(rowMean, (d) => height - 1 - d, maxDepthY, minDepthY);
	const left = barDepth(colMean, (d) => d, maxDepthX, minDepthX);
	const right = barDepth(colMean, (d) => width - 1 - d, maxDepthX, minDepthX);

	if (top + bottom + left + right === 0) return null;
	if (
		top === maxDepthY ||
		bottom === maxDepthY ||
		left === maxDepthX ||
		right === maxDepthX
	) {
		return null;
	}
	const box = {
		x: left,
		y: top,
		w: width - left - right,
		h: height - top - bottom,
	};
	const canonicalAspect = CANONICAL_WIDTH / CANONICAL_HEIGHT;
	const aspectError =
		Math.abs(box.w / box.h - canonicalAspect) / canonicalAspect;
	return aspectError <= CONTENT_ASPECT_TOLERANCE ? box : null;
}
