/**
 * Template matching as resumable steps. Recognizers are generators that
 * yield every TM_CCOEFF_NORMED match their next decision needs and resume
 * with the scores, so one sequential algorithm runs on two drivers: `runSync`
 * answers each request lazily on the calling thread, while a batching driver
 * (worker/gpu-matcher.ts) answers the union of every pending request from many
 * generators with one GPU dispatch. `all` steps generators in lockstep so
 * independent reads share round trips.
 *
 * Both drivers compute the score exactly: integer cross, window and square
 * sums, one f64 normalization with OpenCV's guards (`normalizeNcc`), rounded
 * to f32 like OpenCV's result mat. A score is therefore bit-identical on
 * either driver (OpenCV's own matchTemplate runs a float DFT whose result
 * wanders by up to ~3e-4, enough to flip a near-tie between them).
 */
import { simdCrossSums } from "./cross-sums";
import { getCV, type Mat } from "./cv";

export interface MatchRequest {
	/** search image; must stay alive until the generator resumes past its scores */
	image: Mat;
	templates: readonly Mat[];
	/**
	 * per template: the result columns [lo, hi] whose max counts (every row);
	 * omitted = the whole result map. An empty window (hi < lo) is never asked.
	 */
	windows?: readonly (readonly [number, number])[];
	/**
	 * content identity of `image` (same key = same pixels) so a batching driver
	 * can reuse scores across steps; omitted = never cached
	 */
	key?: string;
}

/** Max score per template index; the sync driver matches on first access. */
export type MatchScores = (templateIndex: number) => number;

export type MatchSteps<T> = Generator<MatchRequest[], T, MatchScores[]>;

/**
 * Runs `steps` to completion on the calling thread, scoring exactly (see the
 * module header); `step` is where a batching driver that gave up mid-run
 * hands over its pending step.
 */
export function runSync<T>(
	steps: MatchSteps<T>,
	step: IteratorResult<MatchRequest[], T> = steps.next(),
): T {
	let current = step;
	while (!current.done) {
		const scorers = current.value.map(exactScorer);
		current = steps.next(scorers.map((scorer) => scorer.scores));
		for (const scorer of scorers) scorer.release();
	}
	return current.value;
}

/**
 * OpenCV's TM_CCOEFF_NORMED over exact integer sums: `num` = N·ΣTI − Σ_c
 * ΣI_c·ΣT_c, `windowVar` = N·ΣI² − Σ_c (ΣI_c)², `templVar` the template's
 * alike; its guards (flat template → 1, flat window → 0, |r| ≥ 1 clamped or
 * voided) and its f32 result.
 */
export function normalizeNcc(
	num: number,
	windowVar: number,
	templVar: number,
): number {
	if (templVar === 0) return 1;
	if (windowVar <= 0) return 0;
	const r = num / (Math.sqrt(windowVar) * Math.sqrt(templVar));
	const a = Math.abs(r);
	if (a < 1) return Math.fround(r);
	if (a < 1.125) return r > 0 ? 1 : -1;
	return 0;
}

type StepResults<T extends readonly MatchSteps<unknown>[]> = {
	-readonly [K in keyof T]: T[K] extends MatchSteps<infer R> ? R : never;
};

/** Steps several generators in lockstep: each yield is the union of their pending requests. */
export function all<T extends readonly MatchSteps<unknown>[]>(
	steps: readonly [...T],
): MatchSteps<StepResults<T>>;
export function all<T>(steps: readonly MatchSteps<T>[]): MatchSteps<T[]>;
export function* all<T>(steps: readonly MatchSteps<T>[]): MatchSteps<T[]> {
	const results = new Array<T>(steps.length);
	let active = steps.map((gen, index) => ({ gen, index, step: gen.next() }));
	for (;;) {
		active = active.filter(({ index, step }) => {
			if (step.done) results[index] = step.value;
			return !step.done;
		});
		if (active.length === 0) return results;
		const scores = yield active.flatMap(
			({ step }) => step.value as MatchRequest[],
		);
		let offset = 0;
		for (const entry of active) {
			const count = (entry.step.value as MatchRequest[]).length;
			entry.step = entry.gen.next(scores.slice(offset, offset + count));
			offset += count;
		}
	}
}

/** A step sequence that asks for nothing and returns `value`: an `all` slot whose read is skipped or already known. */
// biome-ignore lint/correctness/useYield: completing without a request is the point
export function* done<T>(value: T): MatchSteps<T> {
	return value;
}

/**
 * Above this many multiply-adds (placements × template samples) a template's
 * cross sums come from one f64 `filter2D` (a DFT) instead of the direct SIMD
 * loops: the measured crossover.
 */
const DIRECT_MAX_WORK = 1_500_000;

interface Pixels {
	rows: number;
	cols: number;
	ch: number;
	data: Uint8Array;
}

interface TemplatePixels extends Pixels {
	n: number;
	/** per channel ΣT */
	sum: number[];
	/** Σ_c (N·ΣT_c² − (ΣT_c)²) */
	varInt: number;
}

interface ImagePixels extends Pixels {
	/** per-channel integral image, (rows + 1) × (cols + 1) × ch */
	sum: Float64Array;
	/** integral image of Σ_c I_c², (rows + 1) × (cols + 1) */
	squares: Float64Array;
	/** the f64 plane filter2D reads, made on first need and freed with the scorer */
	plane: Mat | null;
}

/** Templates are long-lived (atlases, icon sets): their pixels and sums are read once. */
const templatePixels = new WeakMap<Mat, TemplatePixels>();

/**
 * Exact scores of one request, each computed on first access; released (and
 * guarded against late reads) once the generator resumed past the step.
 */
function exactScorer(request: MatchRequest): {
	scores: MatchScores;
	release: () => void;
} {
	let image: ImagePixels | null = null;
	let released = false;
	return {
		scores: (index) => {
			if (released) throw new Error("match scores read after their step");
			image ??= imagePixels(request.image);
			return exactWindowMax(
				image,
				templateOf(request.templates[index]!),
				request.windows?.[index],
			);
		},
		release: () => {
			released = true;
			image?.plane?.delete();
		},
	};
}

/** Max exact score over the placements in `window` (every row). */
function exactWindowMax(
	image: ImagePixels,
	template: TemplatePixels,
	window: readonly [number, number] | undefined,
): number {
	if (template.varInt === 0) return 1;
	const { rows, cols, ch, sum, squares } = image;
	const [lo, hi] = window ?? [0, cols - template.cols];
	const placementRows = rows - template.rows + 1;
	const work = placementRows * (hi - lo + 1) * template.n * ch;
	const filtered =
		work > DIRECT_MAX_WORK ? filteredCrossSums(image, template) : null;
	// read in place: nothing below allocates on the WASM heap, so the view stays valid
	const cross = filtered?.data64F as Float64Array | undefined;
	const crossStride = cols * ch;
	const direct = filtered
		? null
		: (simdCrossSums()?.compute(image, template, lo, hi) ?? null);
	const width = hi - lo + 1;
	const sumStride = (cols + 1) * ch;
	const squareStride = cols + 1;
	let best = Number.NEGATIVE_INFINITY;
	for (let y = 0; y < placementRows; y++) {
		for (let x = lo; x <= hi; x++) {
			const P = cross
				? Math.round(cross[y * crossStride + x * ch]!)
				: direct
					? direct[y * width + x - lo]!
					: directCrossSum(image, template, x, y);
			const x1 = x + template.cols;
			const y1 = y + template.rows;
			let num = template.n * P;
			let windowVar =
				template.n *
				(squares[y1 * squareStride + x1]! -
					squares[y1 * squareStride + x]! -
					squares[y * squareStride + x1]! +
					squares[y * squareStride + x]!);
			for (let c = 0; c < ch; c++) {
				const S =
					sum[y1 * sumStride + x1 * ch + c]! -
					sum[y1 * sumStride + x * ch + c]! -
					sum[y * sumStride + x1 * ch + c]! +
					sum[y * sumStride + x * ch + c]!;
				num -= S * template.sum[c]!;
				windowVar -= S * S;
			}
			const score = normalizeNcc(num, windowVar, template.varInt);
			if (score > best) best = score;
		}
	}
	filtered?.delete();
	return best;
}

/** ΣT·I over every channel at placement (x, y); rows are contiguous interleaved samples. */
function directCrossSum(
	image: ImagePixels,
	template: TemplatePixels,
	x: number,
	y: number,
): number {
	const rowLength = template.cols * image.ch;
	const imageData = image.data;
	const templateData = template.data;
	let P = 0;
	for (let ty = 0; ty < template.rows; ty++) {
		const ib = ((y + ty) * image.cols + x) * image.ch;
		const tb = ty * rowLength;
		for (let k = 0; k < rowLength; k++) {
			P += imageData[ib + k]! * templateData[tb + k]!;
		}
	}
	return P;
}

/**
 * Cross sums of every placement at once: the interleaved channels read as one
 * plane `ch` times wider, so a single f64 `filter2D` correlates all of them
 * (column x·ch of the output is placement x). Exact after rounding: the
 * largest sum (< 2^32) leaves the f64 DFT's error far under 0.5.
 */
function filteredCrossSums(image: ImagePixels, template: TemplatePixels): Mat {
	const cv = getCV();
	image.plane ??= planeOf(image);
	const kernel = planeOf(template);
	const out = new cv.Mat();
	cv.filter2D(
		image.plane,
		out,
		cv.CV_64F,
		kernel,
		new cv.Point(0, 0),
		0,
		cv.BORDER_CONSTANT,
	);
	kernel.delete();
	return out;
}

/** A single-channel f64 plane of interleaved samples. */
function planeOf(pixels: Pixels): Mat {
	const cv = getCV();
	const plane = new cv.Mat(pixels.rows, pixels.cols * pixels.ch, cv.CV_64F);
	plane.data64F.set(pixels.data);
	return plane;
}

function readPixels(mat: Mat): Pixels {
	const copy = new (getCV().Mat)();
	mat.copyTo(copy);
	const pixels = {
		rows: copy.rows,
		cols: copy.cols,
		ch: copy.channels(),
		data: new Uint8Array(copy.data),
	};
	copy.delete();
	return pixels;
}

function imagePixels(mat: Mat): ImagePixels {
	const pixels = readPixels(mat);
	const { rows, cols, ch, data } = pixels;
	const sum = new Float64Array((rows + 1) * (cols + 1) * ch);
	const squares = new Float64Array((rows + 1) * (cols + 1));
	const sumStride = (cols + 1) * ch;
	for (let y = 0; y < rows; y++) {
		let squareRow = 0;
		const rowSums = new Array<number>(ch).fill(0);
		for (let x = 0; x < cols; x++) {
			for (let c = 0; c < ch; c++) {
				const v = data[(y * cols + x) * ch + c]!;
				rowSums[c]! += v;
				squareRow += v * v;
				sum[(y + 1) * sumStride + (x + 1) * ch + c] =
					sum[y * sumStride + (x + 1) * ch + c]! + rowSums[c]!;
			}
			squares[(y + 1) * (cols + 1) + x + 1] =
				squares[y * (cols + 1) + x + 1]! + squareRow;
		}
	}
	return { ...pixels, sum, squares, plane: null };
}

function templateOf(mat: Mat): TemplatePixels {
	const known = templatePixels.get(mat);
	if (known) return known;
	const pixels = readPixels(mat);
	const { ch, data } = pixels;
	const n = pixels.rows * pixels.cols;
	const sum = new Array<number>(ch).fill(0);
	const sq = new Array<number>(ch).fill(0);
	for (let i = 0; i < n; i++) {
		for (let c = 0; c < ch; c++) {
			const v = data[i * ch + c]!;
			sum[c]! += v;
			sq[c]! += v * v;
		}
	}
	let varInt = 0;
	for (let c = 0; c < ch; c++) varInt += n * sq[c]! - sum[c]! * sum[c]!;
	const template = { ...pixels, n, sum, varInt };
	templatePixels.set(mat, template);
	return template;
}
