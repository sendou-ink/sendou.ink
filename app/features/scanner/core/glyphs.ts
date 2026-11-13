/**
 * Glyph-template text recognition: font/size/position are known, so instead
 * of OCR the crop is segmented by column projection and each segment
 * classified via sliding NCC against grayscale glyph templates (native scale;
 * scaleGlyphSet pre-scales for larger text). Matching runs on the *masked*
 * grayscale crop (background zeroed via a dilated binary mask) so colored
 * backgrounds behave like black while antialiasing survives; scores carry an
 * ink-coverage penalty (else a narrow template inside a wider glyph wins, 'c'
 * over 'o'); segments wider than the median glyph split at deep projection
 * dips ('T' overhangs merge into the next letter); multi-stroke glyphs with a
 * stroke gap (katakana パ/ハ/リ) segment as unmatched fragments, so close pairs
 * are re-classified merged and kept only when the merge decisively wins.
 *
 * A template is a line-height cell: its ink box plus where the line's baseline
 * runs through it. The line is read once with the boxes sliding freely, the
 * glyphs found there say where its baseline runs, how it is tilted and how
 * large it is drawn (lineFrame), and from then on a template only matches at
 * its own height on the line and pays for the ink its cell leaves out. Shapes
 * that differ in nothing but height ('p'/'P', '_'/'-'/'¯', '.'/'・') are
 * different templates that way.
 */
import { median } from "~/utils/number";
import { getCV, type Mat } from "./cv";
import * as Decisions from "./decisions";
import type { FrameData } from "./image";
import { all, exactMatchRows, type MatchSteps } from "./match-steps";

interface AtlasGlyphMeta {
	char: string;
	x: number;
	y: number;
	w: number;
	h: number;
	/**
	 * "fixture" = exact pixel crop from a labeled frame (high fidelity, sparse);
	 * "font" = rendered from game fonts (full coverage, imperfect). Recognition
	 * takes the max score, so fixture glyphs win where they exist.
	 */
	source?: "fixture" | "font";
	/**
	 * Rows from the top of the box down to the baseline of the line the glyph
	 * was drawn on (fractional; past `h` for a glyph floating above it, negative
	 * for one hanging under it). With it the box is a line-height cell stored
	 * without its empty rows. Missing only in what bootstrap-atlas-from-fixture.ts
	 * writes: such an atlas does not load.
	 */
	baseline?: number;
	/**
	 * Fixture crops only: the text line the crop was cut from and the box's top
	 * row within it, which is what build-glyph-atlas.ts places `baseline` from.
	 */
	line?: { id: number; top: number };
}

export interface AtlasMeta {
	/** nominal glyph height in canonical-1080p pixels */
	height: number;
	glyphs: AtlasGlyphMeta[];
}

interface Glyph {
	char: string;
	/** grayscale white-on-black, tight box */
	mat: Mat;
	/** `mat`'s dimensions, kept off the embind accessors in the matching loops */
	rows: number;
	cols: number;
	/** count of pixels above the binarization threshold */
	ink: number;
	/** exact fixture crop vs font-rendered approximation */
	source: "fixture" | "font";
	/** rows from the top of `mat` down to the baseline of its line (fractional; negative for a mark hanging under it) */
	ascent: number;
	/** lazily-built PRESCREEN_SCALE thumbnail for the eligibility prescreen */
	small?: { mat: Mat; rows: number; cols: number };
}

export interface GlyphSet {
	glyphs: Glyph[];
	height: number;
	/** median tight-box glyph width, used for split/space heuristics */
	medianWidth: number;
	/** rows the set's tallest glyph reaches over the baseline and its deepest under it: the line-height cell */
	cell: { above: number; below: number };
}

const TEMPLATE_BIN_THRESHOLD = 128;

/**
 * A GlyphSet whose glyphs (and median width) are built on first use: sets are
 * made per detector at startup, most are read only when their screen shows
 * up, and slicing or rescaling thousands of glyphs dominated worker startup.
 */
function lazyGlyphSet(
	height: number,
	build: () => { glyphs: Glyph[]; medianWidth: number },
): GlyphSet {
	let built: { glyphs: Glyph[]; medianWidth: number } | null = null;
	let cell: GlyphSet["cell"] | null = null;
	return {
		height,
		get glyphs() {
			built ??= build();
			return built.glyphs;
		},
		get medianWidth() {
			built ??= build();
			return built.medianWidth;
		},
		get cell() {
			cell ??= {
				above: Math.max(0, ...this.glyphs.map((g) => g.ascent)),
				below: Math.max(0, ...this.glyphs.map((g) => g.rows - g.ascent)),
			};
			return cell;
		},
	};
}

/** Slice glyph templates out of an atlas image using its metadata (on first use). */
export function loadGlyphSet(atlas: FrameData, meta: AtlasMeta): GlyphSet {
	if (meta.glyphs.some((g) => g.baseline === undefined)) {
		throw new Error(
			"glyph atlas without baselines: rebuild it with scanner:build-glyph-atlas",
		);
	}
	return lazyGlyphSet(meta.height, () => {
		const cv = getCV();
		const full = cv.matFromImageData(atlas as unknown as ImageData);
		const gray = new cv.Mat();
		cv.cvtColor(full, gray, cv.COLOR_RGBA2GRAY);
		full.delete();

		const glyphs: Glyph[] = meta.glyphs.map((g) => {
			// NB: .data/.clone() are broken on ROI views in this opencv.js build;
			// always copyTo into a fresh mat before pixel access.
			const view = gray.roi(new cv.Rect(g.x, g.y, g.w, g.h));
			const box = new cv.Mat();
			view.copyTo(box);
			view.delete();
			const { mat, top } = tightCropGray(box, TEMPLATE_BIN_THRESHOLD);
			box.delete();
			// untagged glyphs predate hybrid atlases and were all fixture crops
			return {
				char: g.char,
				mat,
				rows: mat.rows,
				cols: mat.cols,
				ink: inkOf(mat),
				source: g.source ?? "fixture",
				ascent: g.baseline! - top,
			};
		});
		gray.delete();
		const widths = glyphs.map((g) => g.cols).sort((a, b) => a - b);
		return { glyphs, medianWidth: widths[Math.floor(widths.length / 2)] ?? 8 };
	});
}

const scaledSets = new WeakMap<GlyphSet, Map<number, GlyphSet>>();

/**
 * Resize every glyph by `factor` (e.g. to reuse paint digits for team scores),
 * on first use. The same set at the same factor is shared: its glyphs are
 * read-only templates.
 */
export function scaleGlyphSet(set: GlyphSet, factor: number): GlyphSet {
	let byFactor = scaledSets.get(set);
	if (!byFactor) {
		byFactor = new Map();
		scaledSets.set(set, byFactor);
	}
	const known = byFactor.get(factor);
	if (known) return known;
	const scaled = lazyGlyphSet(Math.round(set.height * factor), () => {
		const cv = getCV();
		const glyphs = set.glyphs.map((g) => {
			const mat = new cv.Mat();
			cv.resize(g.mat, mat, new cv.Size(0, 0), factor, factor, cv.INTER_CUBIC);
			return {
				char: g.char,
				mat,
				rows: mat.rows,
				cols: mat.cols,
				ink: inkOf(mat),
				source: g.source,
				ascent: g.ascent * factor,
			};
		});
		return { glyphs, medianWidth: Math.round(set.medianWidth * factor) };
	});
	byFactor.set(factor, scaled);
	return scaled;
}

/** Count of pixels above the binarization threshold. */
function inkOf(mat: Mat): number {
	let ink = 0;
	for (const v of mat.data as Uint8Array) if (v > TEMPLATE_BIN_THRESHOLD) ink++;
	return ink;
}

/** Crop a grayscale mat to the tight bounds of its above-threshold pixels; `top` is the first row kept. */
function tightCropGray(
	gray: Mat,
	threshold: number,
): { mat: Mat; top: number } {
	const cv = getCV();
	const { cols, rows, data } = gray;
	let xMin = cols;
	let xMax = -1;
	let yMin = rows;
	let yMax = -1;
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			if (data[y * cols + x]! > threshold) {
				if (x < xMin) xMin = x;
				if (x > xMax) xMax = x;
				if (y < yMin) yMin = y;
				if (y > yMax) yMax = y;
			}
		}
	}
	const out = new cv.Mat();
	if (xMax < 0) {
		gray.copyTo(out);
		return { mat: out, top: 0 };
	}
	const view = gray.roi(
		new cv.Rect(xMin, yMin, xMax - xMin + 1, yMax - yMin + 1),
	);
	view.copyTo(out);
	view.delete();
	return { mat: out, top: yMin };
}

export interface RecognizedChar {
	char: string;
	score: number;
	/** segment bounds relative to the crop */
	x0: number;
	x1: number;
	/** segment ink extent relative to the crop (y1 exclusive), for baseline checks */
	y0: number;
	y1: number;
	/** runner-up candidates for this segment (debugging/tuning aid) */
	candidates?: {
		char: string;
		score: number;
		ncc: number;
		source: "fixture" | "font";
	}[];
}

export interface RecognizedText {
	text: string;
	chars: RecognizedChar[];
	/** min char score (0 when ink was present but nothing was recognized) */
	confidence: number;
}

export interface RecognizeOptions {
	/** binarization threshold for segmentation/masking (white text) */
	binThreshold?: number;
	/** min white pixels for a column to count as ink */
	minColumnPixels?: number;
	/** gaps wider than this emit a space; Infinity disables spaces */
	spaceGap?: number;
	/** discard chars scoring below this */
	minCharScore?: number;
	/** runner-up candidates kept per segment */
	maxCandidates?: number;
}

interface Segment {
	x0: number;
	x1: number;
}

function columnProfile(binary: Mat): number[] {
	const { cols, rows, data } = binary;
	const profile = new Array<number>(cols).fill(0);
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			if (data[y * cols + x]! > 0) profile[x]!++;
		}
	}
	return profile;
}

function segmentColumns(profile: number[], minColumnPixels: number): Segment[] {
	const segments: Segment[] = [];
	let start = -1;
	for (let x = 0; x < profile.length; x++) {
		const on = profile[x]! > minColumnPixels;
		if (on && start < 0) start = x;
		if (!on && start >= 0) {
			if (x - start >= 2) segments.push({ x0: start, x1: x });
			start = -1;
		}
	}
	if (start >= 0 && profile.length - start >= 2) {
		segments.push({ x0: start, x1: profile.length });
	}
	return segments;
}

/** Distance from `w` to the nearest positive multiple of `unit`. */
function widthError(w: number, unit: number): number {
	const n = Math.max(1, Math.round(w / unit));
	return Math.abs(w - n * unit);
}

function splitWideSegment(
	profile: number[],
	seg: Segment,
	medianWidth: number,
): Segment[] {
	const maxCharWidth = Math.round(medianWidth * 1.5);
	if (seg.x1 - seg.x0 <= maxCharWidth) return [seg];
	// Split at the dip deepest relative to its neighboring peaks, not raw
	// minimum: the raw min can land inside a thin-but-real stroke (a 'T' top
	// bar profiles as low as the blurred gap to the next glyph).
	const leftMax = new Array<number>(seg.x1).fill(0);
	const rightMax = new Array<number>(seg.x1).fill(0);
	let running = 0;
	for (let i = seg.x0; i < seg.x1; i++) {
		leftMax[i] = running;
		running = Math.max(running, profile[i]!);
	}
	running = 0;
	for (let i = seg.x1 - 1; i >= seg.x0; i--) {
		rightMax[i] = running;
		running = Math.max(running, profile[i]!);
	}
	let best = -1;
	let bestRatio = Number.POSITIVE_INFINITY;
	for (let i = seg.x0 + 3; i < seg.x1 - 3; i++) {
		const ratio =
			profile[i]! / Math.max(1, Math.min(leftMax[i]!, rightMax[i]!));
		if (ratio < bestRatio) {
			bestRatio = ratio;
			best = i;
		}
	}
	if (best < 0 || Decisions.above("glyphs:splitDipMaxRatio", bestRatio, 0.45)) {
		return [seg];
	}
	// The dip is often a plateau of equally-low columns whose ink ownership
	// is ambiguous; cut at whichever edge leaves the left part closest to a
	// whole glyph width.
	let lo = best;
	let hi = best;
	while (lo - 1 >= seg.x0 + 3 && profile[lo - 1]! <= profile[best]!) lo--;
	while (hi + 1 < seg.x1 - 3 && profile[hi + 1]! <= profile[best]!) hi++;
	const cut =
		widthError(lo - seg.x0, medianWidth) <=
		widthError(hi + 1 - seg.x0, medianWidth)
			? lo
			: hi + 1;
	return [
		...splitWideSegment(profile, { x0: seg.x0, x1: cut }, medianWidth),
		...splitWideSegment(profile, { x0: cut, x1: seg.x1 }, medianWidth),
	];
}

interface SegmentInfo extends Segment {
	ink: number;
	height: number;
	/** ink extent rows (y1 exclusive) */
	y0: number;
	y1: number;
	/** ink above each crop row: inkAbove[y] counts rows 0..y-1 */
	inkAbove: Uint32Array;
}

/** `band` = the crop rows that count (the line's cell); ink on the others is not the line's. */
function measureSegment(
	binary: Mat,
	seg: Segment,
	band: { y0: number; y1: number } | null,
): SegmentInfo {
	const { cols, data, rows } = binary;
	const inkAbove = new Uint32Array(rows + 1);
	const bandY0 = Math.max(0, band?.y0 ?? 0);
	const bandY1 = Math.min(rows, band?.y1 ?? rows);
	let ink = 0;
	let yMin = rows;
	let yMax = -1;
	for (let y = 0; y < rows; y++) {
		if (y >= bandY0 && y < bandY1) {
			for (let x = seg.x0; x < seg.x1; x++) {
				if (data[y * cols + x]! > 0) {
					ink++;
					if (y < yMin) yMin = y;
					if (y > yMax) yMax = y;
				}
			}
		}
		inkAbove[y + 1] = ink;
	}
	return {
		...seg,
		ink,
		height: Math.max(0, yMax - yMin + 1),
		y0: Math.min(yMin, rows),
		y1: yMax + 1,
		inkAbove,
	};
}

/**
 * Where a line of text runs through its crop: its baseline crosses column x at
 * row `base + slope * x` (battle log tags are tilted, a levelled death tag
 * keeps a little of its tilt), and its glyphs measure `scale` times their
 * templates (each caller scales its set to a nominal height: the quick battle
 * log's names come out a tenth smaller than their set). On it a glyph's ink
 * box runs from `ascent * scale` rows over the baseline to
 * `(rows - ascent) * scale` under it: its cell.
 */
interface LineFrame {
	base: number;
	slope: number;
	scale: number;
}

/** Rows a glyph's ink may be off its cell: whole-pixel rounding on both sides, more on large text. */
function cellTolerance(set: GlyphSet): number {
	return 1 + Math.round(0.02 * set.height);
}

/**
 * A template leaving this share of the segment's ink outside its cell is not
 * read at all (a mark at another height: '_' for '-'), and what it does leave
 * out costs it this many times the share: a tail is a few pixels of a 'j',
 * and they are all that tells it from the 'i'.
 */
const CELL_MAX_UNCOVERED = 0.5;
const CELL_UNCOVERED_WEIGHT = 0.75;

/** The row the line's baseline crosses the middle of `seg` at. */
function baselineAt(line: LineFrame, seg: Segment): number {
	return line.base + (line.slope * (seg.x0 + seg.x1)) / 2;
}

/** The crop rows of `glyph`'s cell on a line whose baseline is at `baseline` (fractional, y1 exclusive). */
function cellRows(glyph: Glyph, baseline: number, scale: number) {
	return {
		y0: baseline - glyph.ascent * scale,
		y1: baseline + (glyph.rows - glyph.ascent) * scale,
	};
}

/**
 * Fixture crops are ground truth; a font glyph must beat one by this margin
 * (stops 'I' noise-edging out an exact 'l' crop). Keep tight: at 0.04 a fixture
 * crop of a different char ('h' vs 'b') can displace a correct font match.
 */
const FIXTURE_TIEBREAK = 0.02;
/**
 * ...and the fixture must explain about as much of the segment's ink as the
 * font glyph: an 'L' crop correlates 0.91 with the left stem and floor of a 'U'
 * while covering 0.63 of its ink against the font 'U's 0.93.
 */
const FIXTURE_TIEBREAK_MAX_INK_GAP = 0.1;

const DEFAULT_MAX_CANDIDATES = 5;
/**
 * A dot's template carries a pad row above and below its few ink rows, so on a
 * soft capture (quick log "R.O.B.O.T": 4x3 dots) it outgrows the height ratio
 * and only '_' was left to read them. Blobs no wider than they are tall (plus
 * that pad) accept templates up to the pad taller. Bars stay height-checked
 * while the line's baseline is unknown, since nothing else tells '_' from '-'
 * there; on a line their height over the baseline does, and a soft capture
 * thins a hyphen to three rows, a row under its template.
 */
const DOT_TEMPLATE_PAD_ROWS = 2;

/**
 * A CJK-charset segment leaves thousands of templates eligible with barely
 * differing bounds, so the bound-sorted early break never fires and every
 * template pays a full matchTemplate (tens of seconds per segment). Above this
 * eligibility count a half-scale NCC pass (~16x cheaper) ranks the templates
 * first and only glyphs within PRESCREEN_MARGIN of the front-runner advance to
 * full matching. The margin absorbs the low-res estimate's error and sits far
 * beyond FIXTURE_TIEBREAK, so the tie-break pool survives; the estimate only
 * prunes, never scores. Verified against scanner:report: at these values the
 * report is bit-identical to no-prescreen while a JP splash-tag read drops
 * from ~21s to ~1.3s. Quarter scale is too coarse (20px glyphs at ~5px turn
 * the NCC ranking to noise), a tighter margin loses real reads ('R' at 0.12,
 * stragglers past 0.22), and the keep cap is only a runaway backstop (256 cut
 * true glyphs within the margin).
 */
const PRESCREEN_MIN_ELIGIBLE = 200;
const PRESCREEN_SCALE = 0.5;
const PRESCREEN_MARGIN = 0.3;
const PRESCREEN_MAX_KEEP = 1024;

/**
 * The crop columns a segment's templates are searched over, and the rows
 * while the line's baseline is unknown: the segment's ink rows, since line
 * crops can run far taller than the text (the death tag band is ~2x its
 * glyphs) and every extra row multiplies matching work. The slack keeps every
 * hRatio-eligible template (tRows <= 1.3 * seg.height) placeable.
 */
function searchRegion(
	masked: { rows: number; cols: number },
	seg: SegmentInfo,
) {
	const pad = 5;
	const x0 = Math.max(0, seg.x0 - pad);
	const vSlack = Math.ceil(0.15 * seg.height) + 2;
	const y0 = Math.max(0, seg.y0 - vSlack);
	return {
		x0,
		cols: Math.min(masked.cols, seg.x1 + pad) - x0,
		y0,
		rows: Math.min(masked.rows, seg.y1 + vSlack) - y0,
	};
}

/**
 * Only placements covering most of the segment: the region is padded, so a
 * free-sliding template can otherwise match the *neighboring* glyph inside
 * the pad ('l' next to a narrow 'i' at 0.97+) or a fragment ('t' stem on 'b').
 */
const MIN_SEGMENT_OVERLAP = 0.7;

type RankedCandidate = {
	char: string;
	score: number;
	ncc: number;
	source: "fixture" | "font";
	glyph: Glyph;
};

function* classifySegment(
	masked: Mat,
	seg: SegmentInfo,
	set: GlyphSet,
	/** null = the line's baseline is not known yet: templates slide over the segment's ink rows */
	line: LineFrame | null,
	/**
	 * Exact early-reject floor: a score never exceeds its precomputed bound, so a
	 * caller only asking whether any glyph can beat `scoreFloor` (mergeSplitGlyphs)
	 * lets the bound-sorted loop stop early. Computed scores are identical, but
	 * sub-floor candidates are omitted, so pass it only for probes.
	 */
	scoreFloor = Number.NEGATIVE_INFINITY,
	maxCandidates = DEFAULT_MAX_CANDIDATES,
	/** identity of `masked`'s pixels, so a batching driver can reuse scores */
	maskedKey?: string,
	/** what earlier reads of the crop found, to spare this one the same matches */
	memo: CropMemo = { lowRes: new Map(), free: new Map() },
): MatchSteps<RankedCandidate[]> {
	const segWidth = seg.x1 - seg.x0;
	const spanKey = seg.x0 * 65536 + seg.x1;
	// a template kept to its cell sits on placements the free read already
	// scored, so it cannot beat what it scored there
	const freeScores = line ? memo.free.get(spanKey) : undefined;
	// NB: Mat dimension/data accessors go through embind (validateThis etc.)
	// and are expensive — hoist them out of the per-glyph/per-pixel loops.
	const maskedRows = masked.rows;
	const free = searchRegion({ rows: maskedRows, cols: masked.cols }, seg);
	const x0 = free.x0;
	const regionCols = free.cols;
	const baseline = line ? baselineAt(line, seg) : 0;
	const scale = line?.scale ?? 1;
	const tolerance = cellTolerance(set);

	// Every penalty factor depends only on glyph and segment, and NCC <= 1, so
	// their product bounds a glyph's score before matching. Matching in
	// descending-bound order lets the loop stop once no remaining glyph could
	// come within FIXTURE_TIEBREAK of the best.
	const eligible: EligibleGlyph[] = [];
	for (const glyph of set.glyphs) {
		const tRows = glyph.rows;
		const tCols = glyph.cols;
		if (tCols > regionCols) continue;
		const wRatio = tCols / Math.max(segWidth, 1);
		if (wRatio < 0.4 || wRatio > 2.5) continue;
		// the glyph's height as this line draws it: a line a tenth smaller than
		// its templates would cost every true glyph the height penalty below.
		// (Ink is compared as is: it follows stroke width, which blur changes
		// on its own.)
		const inkRows = tRows * scale;
		const hRatio = inkRows / Math.max(seg.height, 1);
		// a template sliding freely in a taller region can score high on a fragment
		// of the segment (an 'l' bar inside a 'c'), so reject height mismatches
		const padded =
			(line !== null || segWidth <= seg.height + DOT_TEMPLATE_PAD_ROWS) &&
			inkRows - seg.height <= DOT_TEMPLATE_PAD_ROWS;
		if (hRatio < 0.5 || (hRatio > 1.3 && !padded)) continue;
		let y0 = free.y0;
		let rows = free.rows;
		// what the glyph's cell leaves of the segment's ink: the tail of a 'g' is
		// ink an 'o' cannot have, however well its bowl fits
		let covered = 1;
		if (line) {
			const cell = cellRows(glyph, baseline, scale);
			// a template smaller or larger than its cell sits anywhere between
			// flush with the cell's top and flush with its bottom
			const flushTop = Math.round(cell.y0);
			const flushBottom = Math.round(cell.y1) - tRows;
			y0 = Math.max(0, Math.min(flushTop, flushBottom) - tolerance);
			rows =
				Math.min(
					maskedRows,
					Math.max(flushTop, flushBottom) + tRows + tolerance,
				) - y0;
			const cellY0 = Math.max(0, Math.round(cell.y0) - tolerance);
			const cellY1 = Math.min(maskedRows, Math.round(cell.y1) + tolerance);
			const uncovered =
				cellY1 > cellY0
					? 1 -
						(seg.inkAbove[cellY1]! - seg.inkAbove[cellY0]!) /
							Math.max(seg.ink, 1)
					: 1;
			if (uncovered > CELL_MAX_UNCOVERED) continue;
			covered = 1 - CELL_UNCOVERED_WEIGHT * uncovered;
		}
		if (tRows > rows) continue;
		// ink-coverage penalty: templates should explain the segment's ink
		const r =
			Math.min(glyph.ink, seg.ink) / Math.max(Math.max(glyph.ink, seg.ink), 1);
		// height-mismatch penalty: an x-height template on an ascender/descender
		// glyph ('o' on 'b') correlates well on the bowl alone
		const hr =
			Math.min(inkRows, seg.height) /
			Math.max(inkRows, Math.max(seg.height, 1));
		const freeScore =
			freeScores &&
			y0 >= freeScores.y0 &&
			y0 + rows <= freeScores.y0 + freeScores.rows
				? freeScores.ncc.get(glyph)
				: undefined;
		eligible.push({
			glyph,
			tRows,
			tCols,
			r,
			hr,
			covered,
			y0,
			rows,
			bounded: freeScore !== undefined,
			penalty: (0.7 + 0.3 * r) * (0.85 + 0.15 * hr) * covered,
			bound: (freeScore ?? 1) * (0.7 + 0.3 * r) * (0.85 + 0.15 * hr) * covered,
		});
	}
	sortByBound(eligible);

	const candidates: (RankedCandidate & { inkCoverage: number })[] = [];
	const minOverlap = MIN_SEGMENT_OVERLAP * segWidth;
	// In probe mode only "can any glyph beat the floor" matters, so the loop stops
	// once either answer is certain.
	const probeMode = scoreFloor !== Number.NEGATIVE_INFINITY;
	const columns = { x0, cols: regionCols };
	// a probe prunes against its own floor instead of the front-runner: its usual
	// answer is "nothing clears the floor", which otherwise costs a full match of
	// every template whose loose bound exceeds it
	const contenders =
		eligible.length >= PRESCREEN_MIN_ELIGIBLE
			? yield* prescreen(
					masked,
					eligible,
					{ ...free, segX0: seg.x0, segX1: seg.x1 },
					minOverlap,
					probeMode ? scoreFloor : null,
					maskedKey,
					memo.lowRes,
				)
			: eligible;
	// overlap(sx) is concave in sx, so the valid placements form one
	// contiguous rx interval per template; empty ones are never matched
	const regions = rowRegions(masked, columns, maskedKey);
	const slots = contenders.map((contender) => {
		const window = overlapWindow(
			regionCols - contender.tCols + 1,
			x0,
			contender.tCols,
			seg.x0,
			seg.x1,
			minOverlap,
		);
		return window ? regions.add(contender, contender.glyph.mat, window) : null;
	});
	const scores = regions.requests.length > 0 ? yield regions.requests : [];
	const freeNcc = line ? null : new Map<Glyph, number>();
	if (freeNcc)
		memo.free.set(spanKey, { y0: free.y0, rows: free.rows, ncc: freeNcc });
	let bestScore = scoreFloor;
	for (let i = 0; i < contenders.length; i++) {
		const { glyph, r, hr, covered, bound, bounded } = contenders[i]!;
		if (bound < bestScore - (bounded ? RUNNER_UP_MARGIN : FIXTURE_TIEBREAK)) {
			// bounds only fall from here, but a template with a free score is
			// read further under the best than one without
			if (bounded || !freeScores) break;
			continue;
		}
		if (probeMode && (bound <= scoreFloor || bestScore > scoreFloor)) break;
		const slot = slots[i];
		if (!slot) continue;
		const maxVal = scores[slot.request]!(slot.template);
		freeNcc?.set(glyph, maxVal);
		const score = maxVal * (0.7 + 0.3 * r) * (0.85 + 0.15 * hr) * covered;
		if (Number.isFinite(score)) {
			if (score > bestScore) bestScore = score;
			candidates.push({
				char: glyph.char,
				score,
				ncc: maxVal,
				source: glyph.source,
				glyph,
				inkCoverage: r,
			});
		}
	}
	regions.release();
	sortByScore(candidates);
	const top = candidates[0];
	if (top && top.source === "font") {
		const fixture = candidates.find(
			(c) =>
				c.source === "fixture" &&
				Decisions.below(
					"glyphs:FIXTURE_TIEBREAK#score",
					top.score - c.score,
					FIXTURE_TIEBREAK,
				) &&
				// ...only when the fixture's raw correlation is also competitive: a fixture
				// crop of a *different* char landing near the top via the ink penalty must
				// not displace a well-matching font glyph
				Decisions.below(
					"glyphs:FIXTURE_TIEBREAK#ncc",
					top.ncc - c.ncc,
					FIXTURE_TIEBREAK,
				) &&
				Decisions.below(
					"glyphs:FIXTURE_TIEBREAK_MAX_INK_GAP",
					top.inkCoverage - c.inkCoverage,
					FIXTURE_TIEBREAK_MAX_INK_GAP,
				),
		);
		if (fixture && fixture !== top) {
			candidates.splice(candidates.indexOf(fixture), 1);
			candidates.unshift(fixture);
		}
	}
	return candidates.slice(0, maxCandidates);
}

interface EligibleGlyph {
	glyph: Glyph;
	tRows: number;
	tCols: number;
	r: number;
	hr: number;
	covered: number;
	/** crop rows the template may be placed on: `rows` of them from `y0` */
	y0: number;
	rows: number;
	bound: number;
	/** `bound` holds the template's free score, not the 1 no score exceeds */
	bounded: boolean;
	/** the penalty factors alone: `bound` of a template without a free score */
	penalty: number;
}

interface RowRequest {
	image: Mat;
	templates: Mat[];
	windows: (readonly [number, number])[];
	key: string | undefined;
}

/**
 * The search images of one segment: its columns of the crop over the rows a
 * template may be placed on. Read freely every template shares one; on a line
 * with a baseline each template has the rows of its own cell, so templates
 * are grouped by those rows into one request each.
 */
// XXX: the WebGPU driver matches every template asked for, so there the cell read costs a second round trip per line and a request per cell height (fixture set parse 23 s -> 30 s, CPU unchanged): ask it only for templates whose free score can still win, or drop the question with the GPU matcher
function rowRegions(
	masked: Mat,
	columns: { x0: number; cols: number },
	maskedKey: string | undefined,
) {
	const requests: RowRequest[] = [];
	const requestOfRows = new Map<number, number>();
	return {
		requests,
		/** Asks for `template`'s score over `rows`; the slot finds it in the step's scores. */
		add(
			rows: { y0: number; rows: number },
			template: Mat,
			window: readonly [number, number],
		): { request: number; template: number } {
			const rowsKey = rows.y0 * 65536 + rows.rows;
			let request = requestOfRows.get(rowsKey);
			if (request === undefined) {
				const { x0, cols } = columns;
				request = requests.length;
				requestOfRows.set(rowsKey, request);
				requests.push({
					image: masked.roi(new (getCV().Rect)(x0, rows.y0, cols, rows.rows)),
					templates: [],
					windows: [],
					key:
						maskedKey === undefined
							? undefined
							: `${maskedKey}|${x0},${rows.y0},${cols},${rows.rows}`,
				});
			}
			const { templates, windows } = requests[request]!;
			templates.push(template);
			windows.push(window);
			return { request, template: templates.length - 1 };
		},
		release(): void {
			for (const { image } of requests) image.delete();
		},
	};
}

/** The prescreen's low-res NCC per glyph, by the crop region it was taken over. */
type LowResScores = Map<string, Map<Glyph, number>>;

/** What the reads of one crop found so far. */
interface CropMemo {
	lowRes: LowResScores;
	/** per span (x0 · 65536 + x1): the NCC of every template its free read matched, and the crop rows it slid over */
	free: Map<number, { y0: number; rows: number; ncc: Map<Glyph, number> }>;
}

/**
 * How far under the best a template with a known free score is still read on
 * a line: wide enough for every runner-up a resolver asks for (an accented
 * letter up to 0.15 behind the bare one).
 */
const RUNNER_UP_MARGIN = 0.2;

/**
 * Low-res ranking pass over an oversized eligibility list; see PRESCREEN_*.
 * It asks which glyphs look like the segment at all, so the templates slide
 * over the segment's ink rows whether or not the line's baseline is known,
 * and a region's estimates are taken once for every read of it. `region` and
 * `minOverlapFull` carry the caller's placement window in full-res
 * coordinates: without the same min-overlap restriction a template scoring on
 * the neighbor inside the pad inflates the front-runner and prunes the true
 * glyph.
 */
function* prescreen(
	masked: Mat,
	eligible: EligibleGlyph[],
	region: {
		x0: number;
		y0: number;
		cols: number;
		rows: number;
		segX0: number;
		segX1: number;
	},
	minOverlapFull: number,
	/** probe mode: prune against this floor instead of the front-runner */
	probeFloor: number | null,
	maskedKey: string | undefined,
	lowRes: LowResScores,
): MatchSteps<EligibleGlyph[]> {
	const cv = getCV();
	const regionId = `${region.x0},${region.y0},${region.cols},${region.rows}`;
	let known = lowRes.get(regionId);
	if (!known) {
		known = new Map();
		lowRes.set(regionId, known);
	}
	const smallSize = scaledSize(region.cols, region.rows);
	const smallRows = smallSize.height;
	const smallCols = smallSize.width;
	const x0 = region.x0 * PRESCREEN_SCALE;
	const segX0 = region.segX0 * PRESCREEN_SCALE;
	const segX1 = region.segX1 * PRESCREEN_SCALE;
	// the slack pixel keeps quantized low-res placements from cutting a
	// boundary placement the full-res window allows
	const minOverlap = minOverlapFull * PRESCREEN_SCALE - 1;
	// entries the low-res pass cannot estimate (degenerate template or no valid
	// placement after scaling) are force-kept but stay out of the front-runner
	// max, or their untightened bound (≈1) prunes every estimated glyph
	const kept: EligibleGlyph[] = [];
	const estimable: EligibleGlyph[] = [];
	const asked: {
		glyph: Glyph;
		small: Mat;
		window: readonly [number, number];
	}[] = [];
	for (const entry of eligible) {
		const small = smallGlyph(entry.glyph);
		if (
			small.rows < 2 ||
			small.cols < 2 ||
			small.rows > smallRows ||
			small.cols > smallCols
		) {
			kept.push(entry);
			continue;
		}
		const window = overlapWindow(
			smallCols - small.cols + 1,
			x0,
			small.cols,
			segX0,
			segX1,
			minOverlap,
		);
		if (!window) {
			kept.push(entry);
			continue;
		}
		estimable.push(entry);
		if (!known.has(entry.glyph)) {
			asked.push({ glyph: entry.glyph, small: small.mat, window });
		}
	}
	if (asked.length > 0) {
		const view = masked.roi(
			new cv.Rect(region.x0, region.y0, region.cols, region.rows),
		);
		const smallRegion = new cv.Mat();
		cv.resize(view, smallRegion, smallSize, 0, 0, cv.INTER_AREA);
		view.delete();
		const [scoreOf] = yield [
			{
				image: smallRegion,
				templates: asked.map((a) => a.small),
				windows: asked.map((a) => a.window),
				key:
					maskedKey === undefined
						? undefined
						: `${maskedKey}|${regionId}|small`,
			},
		];
		for (const [i, { glyph }] of asked.entries()) known.set(glyph, scoreOf!(i));
		smallRegion.delete();
	}
	// ranked by the penalties alone, so templates with and without a free
	// score are estimated alike
	const scored = estimable.map((entry) => ({
		entry,
		est: known.get(entry.glyph)! * entry.penalty,
	}));
	scored.sort((a, b) => b.est - a.est);
	if (scored.length > 0) {
		const floor =
			probeFloor !== null
				? probeFloor - PRESCREEN_MARGIN
				: scored[0]!.est - PRESCREEN_MARGIN;
		let taken = 0;
		for (const { entry, est } of scored) {
			if (est < floor || taken >= PRESCREEN_MAX_KEEP) break;
			kept.push(entry);
			taken++;
		}
	}
	// the main matching loop's early break assumes descending bounds
	kept.sort((a, b) => b.bound - a.bound);
	return kept;
}

function smallGlyph(glyph: Glyph): { mat: Mat; rows: number; cols: number } {
	if (!glyph.small) {
		const cv = getCV();
		const small = new cv.Mat();
		cv.resize(
			glyph.mat,
			small,
			scaledSize(glyph.cols, glyph.rows),
			0,
			0,
			cv.INTER_AREA,
		);
		glyph.small = { mat: small, rows: small.rows, cols: small.cols };
	}
	return glyph.small;
}

function scaledSize(cols: number, rows: number) {
	const cv = getCV();
	return new cv.Size(
		Math.max(1, Math.round(cols * PRESCREEN_SCALE)),
		Math.max(1, Math.round(rows * PRESCREEN_SCALE)),
	);
}

/**
 * The contiguous [lo, hi] run of the `cols` result columns whose placement (a
 * `width`-wide template at `offset + rx`) overlaps [segX0, segX1) by at least
 * `minOverlap`; null when none does. Overlap is concave in rx, so the valid
 * placements are one interval.
 */
function overlapWindow(
	cols: number,
	offset: number,
	width: number,
	segX0: number,
	segX1: number,
	minOverlap: number,
): readonly [number, number] | null {
	const valid = (rx: number) =>
		Math.min(offset + rx + width, segX1) - Math.max(offset + rx, segX0) >=
		minOverlap;
	let lo = 0;
	while (lo < cols && !valid(lo)) lo++;
	let hi = cols - 1;
	while (hi >= lo && !valid(hi)) hi--;
	return hi < lo ? null : [lo, hi];
}

/**
 * Stable in-place sorts, descending by one field: the order `Array.sort`
 * with `(a, b) => b.field - a.field` gives, by insertion for the short lists
 * here (the field read directly, so the loop stays monomorphic).
 */
function sortByBound(items: EligibleGlyph[]): void {
	if (items.length > 64) {
		items.sort((a, b) => b.bound - a.bound);
		return;
	}
	for (let i = 1; i < items.length; i++) {
		const item = items[i]!;
		let j = i - 1;
		while (j >= 0 && items[j]!.bound < item.bound) {
			items[j + 1] = items[j]!;
			j--;
		}
		items[j + 1] = item;
	}
}

function sortByScore<T extends { score: number }>(items: T[]): void {
	if (items.length > 64) {
		items.sort((a, b) => b.score - a.score);
		return;
	}
	for (let i = 1; i < items.length; i++) {
		const item = items[i]!;
		let j = i - 1;
		while (j >= 0 && items[j]!.score < item.score) {
			items[j + 1] = items[j]!;
			j--;
		}
		items[j + 1] = item;
	}
}

interface ClassifiedSegment {
	seg: SegmentInfo;
	ranked: RankedCandidate[];
	/** read freely it looked like a glyph the line keeps at another height, and nothing at its own came close */
	displaced?: boolean;
}

/**
 * Multi-stroke glyphs whose strokes never connect (katakana ハ/パ/リ) segment as
 * two fragments no full-glyph template matches (width-ratio filter). Close
 * neighbor pairs are re-classified merged and kept only when the merge beats
 * both fragments by a clear margin — genuine pairs ("rn", "VV") read well
 * alone, so a lookalike merge ('m', 'W') can't clear it. Kana gaps run wide
 * (い's strokes sit ~0.4 medianWidth apart at tag-name scale), so the gap ratio
 * reaches past that while staying below the space gap (0.55).
 */
const MERGE_MAX_GAP_RATIO = 0.45;
const MERGE_MARGIN = 0.02;
/**
 * A fragment no template explains (ル's left stroke reads ィ at 0.61) is itself
 * evidence of a split glyph: the merge then only has to be a strong read that
 * keeps up with the better fragment, which a fixture crop of a lookalike can
 * outscore on its own stroke ('L' at 0.87 on ル's right stroke, ル at 0.86).
 */
const MERGE_WEAK_FRAGMENT = 0.65;
const MERGE_STRONG_READ = 0.8;
const MERGE_WEAK_SLACK = 0.03;
/**
 * A fragment that read freely as a glyph the line keeps at another height,
 * and as nothing near as well at its own, is a stroke of a split glyph however
 * well the stroke matched (い's right stroke reads as a prime at 0.80, which
 * belongs at the cap line, and at its own height as 'r' at 0.68, beside its
 * left stroke as 'ι' at 0.90 and い at 0.84), so its pair only needs the
 * merge to be a strong read.
 */
const MERGE_DISPLACED_DROP = 0.1;

function* mergeSplitGlyphs(
	items: ClassifiedSegment[],
	ctx: RecutContext,
): MatchSteps<void> {
	const { set, maxCandidates } = ctx;
	const maxGap = Math.max(3, Math.round(set.medianWidth * MERGE_MAX_GAP_RATIO));
	const maxCharWidth = Math.round(set.medianWidth * 1.5);
	const mergeCandidate = (i: number) => {
		const a = items[i]!;
		const b = items[i + 1]!;
		const gap = b.seg.x0 - a.seg.x1;
		const width = b.seg.x1 - a.seg.x0;
		if (gap > maxGap || width > maxCharWidth) return null;
		const seg = ctx.measure({ x0: a.seg.x0, x1: b.seg.x1 });
		const aScore = a.ranked[0]?.score ?? 0;
		const bScore = b.ranked[0]?.score ?? 0;
		const fragmentBest = Math.max(aScore, bScore);
		let floor = fragmentBest + MERGE_MARGIN;
		if (a.displaced || b.displaced) {
			floor = Math.min(floor, MERGE_STRONG_READ);
		} else if (
			Decisions.below(
				"glyphs:MERGE_WEAK_FRAGMENT",
				Math.min(aScore, bScore),
				MERGE_WEAK_FRAGMENT,
			)
		) {
			floor = Math.min(
				floor,
				Math.max(MERGE_STRONG_READ, fragmentBest - MERGE_WEAK_SLACK),
			);
		}
		return { seg, floor };
	};
	if (ctx.speculative) {
		// batching driver: every pair's probe and full read in one lockstep, so
		// the sequential pass below mostly hits the driver's score cache
		const pairs = items
			.slice(0, -1)
			.map((_, i) => mergeCandidate(i))
			.filter((pair) => pair !== null);
		yield* all(
			pairs.flatMap(({ seg, floor }) => [
				classify(ctx, seg, floor),
				classify(ctx, seg, undefined, maxCandidates),
			]),
		);
	}
	for (let i = 0; i + 1 < items.length; ) {
		const candidate = mergeCandidate(i);
		if (!candidate) {
			i++;
			continue;
		}
		const { seg, floor } = candidate;
		// Probe with the floor first: most neighbor pairs are genuine letter pairs
		// whose merge can't win, so the bound-sorted matching stops almost at once.
		// Probe scores are exact, so "nothing beats the floor" is definitive.
		const probe = yield* classify(ctx, seg, floor);
		let merged = false;
		if (probe.some((c) => c.score > floor)) {
			// full run (rare): the winning merge's ranked list must also carry
			// the sub-floor runner-up candidates downstream consumers see
			const ranked = yield* classify(ctx, seg, undefined, maxCandidates);
			if (Decisions.above("glyphs:mergeFloor", ranked[0]?.score ?? 0, floor)) {
				// stay at i: the merged segment may absorb yet another stroke
				items.splice(i, 2, { seg, ranked });
				merged = true;
			}
		}
		if (!merged) i++;
	}
}

/**
 * A wide-segment split can land inside a glyph: capture blur can leave the gap
 * between two glyphs shallower than the hollows of their bowls, so the
 * deepest-dip cut severs a bowl edge ("do" reading as "′k"). Both halves then
 * classify poorly, so adjacent low-scoring segments are re-cut at each profile
 * dip across their joint span and the cut whose weaker half classifies best
 * wins. Scores carry real noise at those blur levels (a wrong "l|U" outscored a
 * true "d|u" by 0.07), so a re-cut is adopted only when it is a decent read in
 * absolute terms and decisively better than the original pair.
 */
const RECUT_MAX_SCORE = 0.75;
const RECUT_MARGIN = 0.08;
const RECUT_MIN_SCORE = 0.7;

function dipCuts(profile: number[], x0: number, x1: number): number[] {
	const cuts = new Set<number>();
	for (let x = x0 + 3; x <= x1 - 3; x++) {
		const v = profile[x]!;
		if (v <= profile[x - 1]! && v <= profile[x + 1]!) {
			cuts.add(x);
			// ink ownership over the dip is ambiguous; try its far edge too
			if (x + 1 <= x1 - 3) cuts.add(x + 1);
		}
	}
	return [...cuts];
}

/**
 * The `count` lowest dips (ties broken by depth relative to the peaks either
 * side), with each dip's far edge like dipCuts. Raw depth first: the junction
 * of two fused glyphs is the sparsest column even when one of them is a low
 * bar ("g_") whose own columns hold barely more ink.
 */
function deepestDipCuts(
	profile: number[],
	x0: number,
	x1: number,
	count: number,
): number[] {
	const dips: { x: number; value: number; ratio: number }[] = [];
	for (let x = x0 + 3; x <= x1 - 3; x++) {
		const v = profile[x]!;
		if (v > profile[x - 1]! || v > profile[x + 1]!) continue;
		const peak = Math.min(
			Math.max(...profile.slice(x0, x)),
			Math.max(...profile.slice(x + 1, x1)),
		);
		dips.push({ x, value: v, ratio: v / Math.max(1, peak) });
	}
	dips.sort((a, b) => a.value - b.value || a.ratio - b.ratio);
	const cuts = new Set<number>();
	for (const { x } of dips.slice(0, count)) {
		cuts.add(x);
		if (x + 1 <= x1 - 3) cuts.add(x + 1);
	}
	return [...cuts];
}

interface RecutContext {
	profile: number[];
	/** measureSegment on the binarized crop, memoized: the prefetch and the sequential passes measure the same spans */
	measure: (seg: Segment) => SegmentInfo;
	masked: Mat;
	set: GlyphSet;
	/** where the line sits in the crop; null while it is read to find that out */
	line: LineFrame | null;
	maxCandidates: number;
	maskedKey: string | undefined;
	/** prefetch whole candidate sets in lockstep (batching drivers only: on the sync path it is wasted work) */
	speculative: boolean;
	memo: CropMemo;
	/** `classify` results by span (x0 · 65536 + x1), then floor and candidate cap */
	classified: Map<
		number,
		{ floor: number; maxCandidates: number; ranked: RankedCandidate[] }[]
	>;
}

/**
 * classifySegment within one recognition, memoized: a result is a pure
 * function of the masked crop, the span, the floor and the candidate cap
 * (scores are exact on every driver), and the speculative prefetch and the
 * sequential pass after it ask for many spans more than once.
 */
function* classify(
	ctx: RecutContext,
	seg: SegmentInfo,
	scoreFloor = Number.NEGATIVE_INFINITY,
	maxCandidates = DEFAULT_MAX_CANDIDATES,
): MatchSteps<RankedCandidate[]> {
	const spanKey = seg.x0 * 65536 + seg.x1;
	let results = ctx.classified.get(spanKey);
	if (!results) {
		results = [];
		ctx.classified.set(spanKey, results);
	}
	for (const known of results) {
		if (known.floor === scoreFloor && known.maxCandidates === maxCandidates)
			return known.ranked;
	}
	const ranked = yield* classifySegment(
		ctx.masked,
		seg,
		ctx.set,
		ctx.line,
		scoreFloor,
		maxCandidates,
		ctx.maskedKey,
		ctx.memo,
	);
	results.push({ floor: scoreFloor, maxCandidates, ranked });
	return ranked;
}

/**
 * Best two-way cut of `span` among `cuts` whose weaker half classifies above
 * `minScore` (raised to each adopted cut's weaker score); cuts inside `skip` are
 * the original segmentation and are not retried.
 */
function recutHalves(
	ctx: RecutContext,
	span: Segment,
	cuts: number[],
	skip: Segment | null,
) {
	return cuts
		.filter((cut) => !(skip && cut >= skip.x0 && cut <= skip.x1))
		.map((cut) => ({
			left: ctx.measure({ x0: span.x0, x1: cut }),
			right: ctx.measure({ x0: cut, x1: span.x1 }),
		}));
}

/** Batching drivers only: every probe and full read `bestRecut` may ask for at `minScore`, in one lockstep. */
function prefetchRecuts(
	ctx: RecutContext,
	recuts: { halves: ReturnType<typeof recutHalves>; minScore: number }[],
): MatchSteps<unknown> {
	return all(
		recuts.flatMap(({ halves, minScore }) =>
			halves.flatMap(({ left, right }) =>
				[left, right].flatMap((seg) => [
					classify(ctx, seg, minScore),
					classify(ctx, seg, undefined, ctx.maxCandidates),
				]),
			),
		),
	);
}

function* bestRecut(
	ctx: RecutContext,
	span: Segment,
	cuts: number[],
	skip: Segment | null,
	minScore: number,
): MatchSteps<[ClassifiedSegment, ClassifiedSegment] | null> {
	const { maxCandidates } = ctx;
	let floor = minScore;
	let best: [ClassifiedSegment, ClassifiedSegment] | null = null;
	for (const { left, right } of recutHalves(ctx, span, cuts, skip)) {
		// probe with the floor first (see mergeSplitGlyphs): most candidate
		// cuts can't beat it and the probes early-stop almost immediately
		const canWin = function* (seg: SegmentInfo): MatchSteps<boolean> {
			const probe = yield* classify(ctx, seg, floor);
			return probe.some((c) => c.score > floor);
		};
		if (!(yield* canWin(left)) || !(yield* canWin(right))) continue;
		const leftRanked = yield* classify(ctx, left, undefined, maxCandidates);
		const rightRanked = yield* classify(ctx, right, undefined, maxCandidates);
		const weaker = Math.min(
			leftRanked[0]?.score ?? 0,
			rightRanked[0]?.score ?? 0,
		);
		if (weaker <= floor) continue;
		floor = weaker;
		best = [
			{ seg: left, ranked: leftRanked },
			{ seg: right, ranked: rightRanked },
		];
	}
	return best;
}

function* recutMiscutPairs(
	items: ClassifiedSegment[],
	ctx: RecutContext,
): MatchSteps<void> {
	const maxGap = Math.max(
		3,
		Math.round(ctx.set.medianWidth * MERGE_MAX_GAP_RATIO),
	);
	const recut = (i: number) => {
		const a = items[i]!;
		const b = items[i + 1]!;
		const aScore = a.ranked[0]?.score ?? 0;
		const bScore = b.ranked[0]?.score ?? 0;
		if (
			Decisions.atLeast(
				"glyphs:RECUT_MAX_SCORE#pair",
				aScore,
				RECUT_MAX_SCORE,
			) ||
			Decisions.atLeast("glyphs:RECUT_MAX_SCORE#pair", bScore, RECUT_MAX_SCORE)
		) {
			return null;
		}
		if (b.seg.x0 - a.seg.x1 > maxGap) return null;
		const floor = Math.max(
			RECUT_MIN_SCORE,
			Math.max(aScore, bScore) + RECUT_MARGIN,
		);
		const span = { x0: a.seg.x0, x1: b.seg.x1 };
		const cuts = dipCuts(ctx.profile, span.x0, span.x1);
		const skip = { x0: a.seg.x1, x1: b.seg.x0 };
		return { span, cuts, skip, floor };
	};
	if (ctx.speculative) {
		yield* prefetchRecuts(
			ctx,
			items
				.slice(0, -1)
				.map((_, i) => recut(i))
				.filter((r) => r !== null)
				.map(({ span, cuts, skip, floor }) => ({
					halves: recutHalves(ctx, span, cuts, skip),
					minScore: floor,
				})),
		);
	}
	for (let i = 0; i + 1 < items.length; i++) {
		const candidate = recut(i);
		if (!candidate) continue;
		const { span, cuts, skip, floor } = candidate;
		const best = yield* bestRecut(ctx, span, cuts, skip, floor);
		if (best) items.splice(i, 2, ...best);
	}
}

/**
 * Blur can also fuse two glyphs into one segment narrower than the wide-segment
 * split's floor ("oj" reading as a lone パ, "fi" as ↑), which then classifies
 * poorly as a whole. A low-scoring segment wider than a typical glyph is re-cut
 * the same way, adopted under the same floor and margin. Unreadable text (a
 * splash tag in a decorative face) is full of such segments, so only the three
 * lowest dips are tried: the junction of two fused glyphs is always one.
 */
const FUSED_MIN_WIDTH_RATIO = 1.2;
const FUSED_DIPS_TRIED = 3;

function* splitFusedGlyphs(
	items: ClassifiedSegment[],
	ctx: RecutContext,
): MatchSteps<void> {
	const minWidth = ctx.set.medianWidth * FUSED_MIN_WIDTH_RATIO;
	const fused = (item: ClassifiedSegment) => {
		const score = item.ranked[0]?.score ?? 0;
		if (
			Decisions.atLeast(
				"glyphs:RECUT_MAX_SCORE#fused",
				score,
				RECUT_MAX_SCORE,
			) ||
			Decisions.below(
				"glyphs:FUSED_MIN_WIDTH_RATIO",
				item.seg.x1 - item.seg.x0,
				minWidth,
			)
		)
			return null;
		const floor = Math.max(RECUT_MIN_SCORE, score + RECUT_MARGIN);
		const cuts = deepestDipCuts(
			ctx.profile,
			item.seg.x0,
			item.seg.x1,
			FUSED_DIPS_TRIED,
		);
		return { floor, cuts };
	};
	if (ctx.speculative) {
		yield* prefetchRecuts(
			ctx,
			items.flatMap((item) => {
				const f = fused(item);
				return f
					? [
							{
								halves: recutHalves(ctx, item.seg, f.cuts, null),
								minScore: f.floor,
							},
						]
					: [];
			}),
		);
	}
	for (let i = 0; i < items.length; i++) {
		const item = items[i]!;
		const candidate = fused(item);
		if (!candidate) continue;
		const { floor, cuts } = candidate;
		const best = yield* bestRecut(ctx, item.seg, cuts, null, floor);
		if (best) {
			items.splice(i, 1, ...best);
			i++;
		}
	}
}

/**
 * The wide-segment split cuts at the deepest column dips, but a glyph's own
 * hollow can run deeper than the gap to its neighbor: at 360p a row of 'U's
 * profiles its counters (floor ink only) below the blurred gaps between them
 * ("AHOOUUUUUU" cut into "LduιU"). Pairwise re-cuts can't undo a whole run
 * cut out of phase, so a run of touching segments holding a weak read is
 * re-segmented as a whole: every way to cut it at its column dips into pieces
 * of glyph width is scored by its weakest piece, and the best is adopted under
 * the re-cut floor and margin. Pieces are probed against that floor first, so
 * only the few that can take part are read in full.
 */
/** past this many candidate pieces a run is unreadable text (a decorative splash tag), not worth the reads */
const RESEGMENT_MAX_PIECES = 96;

function* resegmentWeakRuns(
	items: ClassifiedSegment[],
	ctx: RecutContext,
): MatchSteps<void> {
	const maxWidth = Math.round(ctx.set.medianWidth * 1.5);
	const score = (item: ClassifiedSegment) => item.ranked[0]?.score ?? 0;
	const runs: { start: number; end: number; floor: number }[] = [];
	for (let start = 0; start < items.length; ) {
		let end = start + 1;
		while (
			end < items.length &&
			items[end]!.seg.x0 === items[end - 1]!.seg.x1
		) {
			end++;
		}
		const weakest = Math.min(...items.slice(start, end).map(score));
		if (
			end - start >= 2 &&
			Decisions.below("glyphs:RECUT_MAX_SCORE#run", weakest, RECUT_MAX_SCORE)
		) {
			runs.push({
				start,
				end,
				floor: Math.max(RECUT_MIN_SCORE, weakest + RECUT_MARGIN),
			});
		}
		start = end;
	}
	// right to left, so splicing a run keeps the earlier runs' indices
	for (const { start, end, floor } of runs.reverse()) {
		const run = items.slice(start, end);
		const best = yield* bestSegmentation(ctx, run, floor, maxWidth);
		if (best) items.splice(start, end - start, ...best);
	}
}

/** One cut per column dip, at the middle of its flat bottom. */
function dipCenters(profile: number[], x0: number, x1: number): number[] {
	const centers: number[] = [];
	let lo = -1;
	for (let x = x0 + 3; x <= x1 - 2; x++) {
		const v = profile[x]!;
		const isDip = x <= x1 - 3 && v <= profile[x - 1]! && v <= profile[x + 1]!;
		if (isDip && lo < 0) lo = x;
		if (!isDip && lo >= 0) {
			centers.push(Math.round((lo + x) / 2));
			lo = -1;
		}
	}
	return centers;
}

function* bestSegmentation(
	ctx: RecutContext,
	run: ClassifiedSegment[],
	floor: number,
	maxWidth: number,
): MatchSteps<ClassifiedSegment[] | null> {
	const x0 = run[0]!.seg.x0;
	const x1 = run.at(-1)!.seg.x1;
	const cuts = [
		...new Set([
			x0,
			...run.map((item) => item.seg.x1),
			...dipCenters(ctx.profile, x0, x1),
		]),
	].sort((a, b) => a - b);
	const original = new Set(
		run.map((item) => item.seg.x0 * 65536 + item.seg.x1),
	);

	// best[k]: the cut of the run's head up to cuts[k] whose weakest piece
	// scores highest (higher total on ties); only cuts some such cut reaches
	// are cut from, so pieces nothing leads up to are never read
	const best: ({
		weakest: number;
		total: number;
		path: ClassifiedSegment[];
	} | null)[] = cuts.map((_, k) =>
		k === 0 ? { weakest: 1, total: 0, path: [] } : null,
	);
	const piecesFrom = cuts.map((_, from) => {
		const pieces: { to: number; seg: SegmentInfo }[] = [];
		for (let to = from + 1; to < cuts.length; to++) {
			const width = cuts[to]! - cuts[from]!;
			if (width > maxWidth && !original.has(cuts[from]! * 65536 + cuts[to]!))
				break;
			if (width < 3) continue;
			const seg = ctx.measure({ x0: cuts[from]!, x1: cuts[to]! });
			if (seg.ink > 0) pieces.push({ to, seg });
		}
		return pieces;
	});
	if (piecesFrom.flat().length > RESEGMENT_MAX_PIECES) return null;
	for (let from = 0; from < cuts.length - 1; from++) {
		const head = best[from];
		if (!head) continue;
		const pieces = piecesFrom[from]!;
		const probes = yield* all(
			pieces.map(({ seg }) => classify(ctx, seg, floor)),
		);
		const viable = pieces.filter((_, i) =>
			probes[i]!.some((c) => c.score > floor),
		);
		const reads = yield* all(
			viable.map(({ seg }) => classify(ctx, seg, undefined, ctx.maxCandidates)),
		);
		for (const [i, { to, seg }] of viable.entries()) {
			const ranked = reads[i]!;
			const pieceScore = ranked[0]?.score ?? 0;
			if (Decisions.atMost("glyphs:resegmentFloor", pieceScore, floor))
				continue;
			const weakest = Math.min(head.weakest, pieceScore);
			const total = head.total + pieceScore;
			const current = best[to];
			if (
				!current ||
				weakest > current.weakest ||
				(weakest === current.weakest && total > current.total)
			) {
				best[to] = { weakest, total, path: [...head.path, { seg, ranked }] };
			}
		}
	}
	return best.at(-1)?.path ?? null;
}

let maskedKeySeq = 0;

/**
 * Recognizes white-on-dark text in a grayscale crop tight to one text line, as
 * match steps; `speculative` prefetches whole candidate sets in lockstep, which
 * only pays off under a batching driver.
 */
export function* recognizeTextSteps(
	gray: Mat,
	set: GlyphSet,
	options: RecognizeOptions = {},
	speculative = false,
): MatchSteps<RecognizedText> {
	const cv = getCV();
	const {
		binThreshold = 150,
		minColumnPixels = 1,
		spaceGap = Math.max(5, Math.round(set.medianWidth * 0.55)),
		minCharScore = 0.4,
		maxCandidates = DEFAULT_MAX_CANDIDATES,
	} = options;

	const binary = new cv.Mat();
	cv.threshold(gray, binary, binThreshold, 255, cv.THRESH_BINARY);

	// mask the gray crop so background patterns don't take part in matching,
	// dilated so antialiased glyph edges survive
	const mask = new cv.Mat();
	const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
	cv.dilate(binary, mask, kernel, new cv.Point(-1, -1), 2);
	kernel.delete();
	const masked = new cv.Mat(gray.rows, gray.cols, cv.CV_8UC1, new cv.Scalar(0));
	gray.copyTo(masked, mask);
	mask.delete();

	const measured = new Map<number, SegmentInfo>();
	const measure = (seg: Segment) => {
		const spanKey = seg.x0 * 65536 + seg.x1;
		let info = measured.get(spanKey);
		if (!info) {
			info = measureSegment(
				binary,
				seg,
				ctx.line && lineBand(ctx.line, seg, set),
			);
			measured.set(spanKey, info);
		}
		return info;
	};
	const profile = columnProfile(binary);
	const segments = segmentColumns(profile, minColumnPixels).flatMap((s) =>
		splitWideSegment(profile, s, set.medianWidth),
	);

	const ctx: RecutContext = {
		profile,
		measure,
		masked,
		set,
		line: null,
		maxCandidates,
		maskedKey: speculative ? `m${maskedKeySeq++}` : undefined,
		speculative,
		memo: { lowRes: new Map(), free: new Map() },
		classified: new Map(),
	};
	const classifyAll = (spans: Segment[]) =>
		all(
			spans.map((span) =>
				classify(ctx, measure(span), undefined, maxCandidates),
			),
		);
	const freeSegments = segments.map(measure);
	const freeReads = yield* classifyAll(segments);
	ctx.line = lineFrame(masked, freeSegments, freeReads, set);
	// measured anew within the line's rows, and read anew at the glyphs' heights
	if (ctx.line) {
		measured.clear();
		ctx.classified.clear();
	}
	const rankedSegments = ctx.line ? yield* classifyAll(segments) : freeReads;
	const items: ClassifiedSegment[] = segments.map((seg, i) => ({
		seg: measure(seg),
		ranked: rankedSegments[i]!,
		displaced:
			ctx.line !== null &&
			Decisions.above(
				"glyphs:MERGE_DISPLACED_DROP",
				(freeReads[i]![0]?.score ?? 0) - (rankedSegments[i]![0]?.score ?? 0),
				MERGE_DISPLACED_DROP,
			),
	}));
	yield* mergeSplitGlyphs(items, ctx);
	yield* recutMiscutPairs(items, ctx);
	yield* splitFusedGlyphs(items, ctx);
	yield* resegmentWeakRuns(items, ctx);
	const chars: RecognizedChar[] = [];
	let text = "";
	let prevEnd: number | null = null;
	for (const { seg, ranked } of items) {
		if (prevEnd !== null && seg.x0 - prevEnd > spaceGap && text.length > 0) {
			text += " ";
		}
		const top = ranked[0];
		if (top && top.score >= minCharScore) {
			chars.push({
				char: top.char,
				score: top.score,
				x0: seg.x0,
				x1: seg.x1,
				y0: seg.y0,
				y1: seg.y1,
				candidates: ranked.map((c) => ({
					char: c.char,
					score: c.score,
					ncc: c.ncc,
					source: c.source,
				})),
			});
			text += top.char;
		}
		prevEnd = seg.x1;
	}
	binary.delete();
	masked.delete();

	const confidence =
		chars.length > 0
			? Math.min(...chars.map((c) => c.score))
			: segments.length > 0
				? 0
				: 1;
	return { text, chars, confidence };
}

/** steepest baseline taken for a line of text, in rows per column (1.7 degrees) */
const LINE_MAX_SLOPE = 0.03;
/**
 * The candidates of a segment that say where the baseline may be: its best
 * few, and only those scoring near the best. A twin at another height is that
 * close ('P' 0.03 behind 'p'); the best guess at a stroke of a split kana is
 * not, and three such guesses made a tilted line of a level one.
 */
const LINE_CANDIDATES = 3;
const LINE_CANDIDATE_MARGIN = 0.1;
/**
 * How far off its templates' size a line is taken to be. Until the size is
 * measured a glyph's baseline is only known to this share of its ink's
 * distance from it (plus a row), which is how close a candidate must come to
 * a baseline to count for it.
 */
const LINE_MAX_SCALE_ERROR = 0.15;
/** a tilted baseline is tried through the pairs of this many segments, spread over the line */
const LINE_TILT_SEGMENTS = 16;
/** a shorter line is taken to be level: two or three glyphs a row apart are rounding, not tilt */
const LINE_TILT_MIN_GLYPHS = 5;
/** glyphs at least this share of the set's height tell the line's size */
const LINE_SCALE_MIN_HEIGHT = 0.6;

/** A glyph a segment may be, and where the line's baseline would be if it were. */
interface BaselineVote {
	glyph: Glyph;
	/** crop row the glyph's template matched best on */
	top: number;
	baseline: number;
	score: number;
	/** rows a baseline may pass from `baseline` and still count the glyph */
	slack: number;
}

interface VotingSegment {
	seg: SegmentInfo;
	x: number;
	votes: BaselineVote[];
}

/**
 * Where the line is, from a read of its segments with the templates sliding
 * freely: every candidate glyph says where the baseline would be if the
 * segment were that glyph, and the baseline whose glyphs score the most over
 * the whole line wins. Twins of one shape at two heights ('p'/'P') disagree,
 * and the glyphs beside them settle it. The glyphs on the winner then say how
 * large the line is drawn (segment height over template height, the median of
 * the tall ones), how it is tilted, and with both exactly where its baseline
 * runs. Null when nothing was read.
 */
function lineFrame(
	masked: Mat,
	segments: SegmentInfo[],
	reads: RankedCandidate[][],
	set: GlyphSet,
): LineFrame | null {
	const voting = reads.map((ranked, i): VotingSegment => {
		const seg = segments[i]!;
		const candidates = ranked
			.slice(0, LINE_CANDIDATES)
			.filter((c) => c.score >= ranked[0]!.score - LINE_CANDIDATE_MARGIN);
		const tops = placementRows(
			masked,
			seg,
			candidates.map((c) => c.glyph),
		);
		return {
			seg,
			x: (seg.x0 + seg.x1) / 2,
			votes: candidates.map(({ glyph, score }, k) => {
				const top = tops[k]!;
				const farEdge = Math.max(
					Math.abs(glyph.ascent),
					Math.abs(glyph.rows - glyph.ascent),
				);
				return {
					glyph,
					top,
					baseline: top + glyph.ascent,
					score,
					slack: 1 + LINE_MAX_SCALE_ERROR * farEdge,
				};
			}),
		};
	});
	const onLine = glyphsOnBestBaseline(voting);
	if (onLine.length === 0) return null;
	const sizes = onLine
		.filter(({ vote }) => vote.glyph.rows >= LINE_SCALE_MIN_HEIGHT * set.height)
		.map(({ seg, vote }) => seg.height / vote.glyph.rows);
	const scale =
		sizes.length >= 2
			? Math.min(
					1 + LINE_MAX_SCALE_ERROR,
					Math.max(1 - LINE_MAX_SCALE_ERROR, median(sizes)),
				)
			: 1;
	// a template off its glyph's size matched centered on it: the glyph's own
	// top edge is half the size difference further out
	const baselines = onLine.map(({ x, vote }) => ({
		x,
		y:
			vote.top -
			((scale - 1) * vote.glyph.rows) / 2 +
			vote.glyph.ascent * scale,
	}));
	const slope = tiltOf(baselines);
	return {
		base: median(baselines.map(({ x, y }) => y - slope * x)),
		slope,
		scale,
	};
}

/**
 * The glyphs of the baseline that explains the most of the line: per segment
 * the best-scoring vote the baseline passes within its slack of. A level
 * baseline is tried through every voted row, a tilted one through every pair
 * of votes (battle log tags are tilted far enough to lose their ends to any
 * level one), and a tilted one is taken only when it explains more.
 */
function glyphsOnBestBaseline(
	voting: VotingSegment[],
): (VotingSegment & { vote: BaselineVote })[] {
	const baselines: { base: number; slope: number }[] = [
		...new Set(voting.flatMap(({ votes }) => votes.map((v) => v.baseline))),
	].map((base) => ({ base, slope: 0 }));
	const step = Math.max(1, Math.ceil(voting.length / LINE_TILT_SEGMENTS));
	const spread = voting.filter((_, i) => i % step === 0);
	for (const [i, a] of spread.entries()) {
		for (const b of spread.slice(i + 1)) {
			if (b.x === a.x) continue;
			for (const va of a.votes) {
				for (const vb of b.votes) {
					const slope = (vb.baseline - va.baseline) / (b.x - a.x);
					if (slope === 0 || Math.abs(slope) > LINE_MAX_SLOPE) continue;
					baselines.push({ base: va.baseline - slope * a.x, slope });
				}
			}
		}
	}
	let best: { glyphs: (BaselineVote | null)[]; support: number } | null = null;
	for (const { base, slope } of baselines) {
		const glyphs = voting.map(({ x, votes }) => {
			const at = base + slope * x;
			let kept: BaselineVote | null = null;
			for (const vote of votes) {
				if (
					vote.score > (kept?.score ?? 0) &&
					Math.abs(vote.baseline - at) <= vote.slack
				) {
					kept = vote;
				}
			}
			return kept;
		});
		const support = glyphs.reduce((sum, v) => sum + (v?.score ?? 0), 0);
		if (!best || support > best.support) best = { glyphs, support };
	}
	return (best?.glyphs ?? []).flatMap((vote, i) =>
		vote ? [{ ...voting[i]!, vote }] : [],
	);
}

/**
 * The tilt of a line through `points`: the median slope over every pair of
 * them. The whole-row baselines of a level line give exactly zero, and the
 * few glyphs a vote took at the wrong height (a soft hyphen read as an
 * underscore at an end of the line) do not tip it.
 */
function tiltOf(points: { x: number; y: number }[]): number {
	if (points.length < LINE_TILT_MIN_GLYPHS) return 0;
	const slopes: number[] = [];
	for (const [i, a] of points.entries()) {
		for (const b of points.slice(i + 1)) {
			if (b.x !== a.x) slopes.push((b.y - a.y) / (b.x - a.x));
		}
	}
	return Math.max(-LINE_MAX_SLOPE, Math.min(LINE_MAX_SLOPE, median(slopes)));
}

/**
 * The crop row each glyph's template matches `seg` best on, read freely:
 * where the glyph is if the segment is that glyph. Asked of the matcher
 * rather than read off the segment's ink box, which a neighbor's overhang or
 * a border line in the crop stretches.
 */
function placementRows(
	masked: Mat,
	seg: SegmentInfo,
	glyphs: Glyph[],
): number[] {
	if (glyphs.length === 0) return [];
	const cv = getCV();
	const region = searchRegion(masked, seg);
	const view = masked.roi(
		new cv.Rect(region.x0, region.y0, region.cols, region.rows),
	);
	const rows = exactMatchRows(
		view,
		glyphs.map((glyph) => glyph.mat),
		glyphs.map(
			(glyph) =>
				overlapWindow(
					region.cols - glyph.cols + 1,
					region.x0,
					glyph.cols,
					seg.x0,
					seg.x1,
					MIN_SEGMENT_OVERLAP * (seg.x1 - seg.x0),
				)!,
		),
	);
	view.delete();
	return rows.map((row) => region.y0 + row);
}

/** The crop rows of the line's cell at `seg`: where ink can be a glyph of this line at all. */
function lineBand(line: LineFrame, seg: Segment, set: GlyphSet) {
	const baseline = baselineAt(line, seg);
	const tolerance = cellTolerance(set);
	return {
		y0: Math.round(baseline - set.cell.above * line.scale) - tolerance,
		y1: Math.round(baseline + set.cell.below * line.scale) + tolerance,
	};
}
