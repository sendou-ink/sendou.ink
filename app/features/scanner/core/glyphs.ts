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
 */
import { getCV, type Mat } from "./cv";
import type { FrameData } from "./image";

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
	/** count of pixels above the binarization threshold */
	ink: number;
	/** exact fixture crop vs font-rendered approximation */
	source: "fixture" | "font";
	/** lazily-built PRESCREEN_SCALE thumbnail for the eligibility prescreen */
	small?: Mat;
}

export interface GlyphSet {
	glyphs: Glyph[];
	height: number;
	/** median tight-box glyph width, used for split/space heuristics */
	medianWidth: number;
}

const TEMPLATE_BIN_THRESHOLD = 128;

/** Slice glyph templates out of an atlas image using its metadata. */
export function loadGlyphSet(atlas: FrameData, meta: AtlasMeta): GlyphSet {
	const cv = getCV();
	const full = cv.matFromImageData(atlas as unknown as ImageData);
	const gray = new cv.Mat();
	cv.cvtColor(full, gray, cv.COLOR_RGBA2GRAY);
	full.delete();

	const glyphs: Glyph[] = meta.glyphs.map((g) => {
		// NB: .data/.clone() are broken on ROI views in this opencv.js build;
		// always copyTo into a fresh mat before pixel access.
		const view = gray.roi(new cv.Rect(g.x, g.y, g.w, g.h));
		const cell = new cv.Mat();
		view.copyTo(cell);
		view.delete();
		const mat = tightCropGray(cell, TEMPLATE_BIN_THRESHOLD);
		cell.delete();
		let ink = 0;
		for (const v of mat.data) if (v > TEMPLATE_BIN_THRESHOLD) ink++;
		// untagged glyphs predate hybrid atlases and were all fixture crops
		return { char: g.char, mat, ink, source: g.source ?? "fixture" };
	});
	gray.delete();
	const widths = glyphs.map((g) => g.mat.cols).sort((a, b) => a - b);
	const medianWidth = widths[Math.floor(widths.length / 2)] ?? 8;
	return { glyphs, height: meta.height, medianWidth };
}

/** Resize every glyph by `factor` (e.g. to reuse paint digits for team scores). */
export function scaleGlyphSet(set: GlyphSet, factor: number): GlyphSet {
	const cv = getCV();
	const glyphs = set.glyphs.map((g) => {
		const mat = new cv.Mat();
		cv.resize(g.mat, mat, new cv.Size(0, 0), factor, factor, cv.INTER_CUBIC);
		let ink = 0;
		for (const v of mat.data) if (v > TEMPLATE_BIN_THRESHOLD) ink++;
		return { char: g.char, mat, ink, source: g.source };
	});
	return {
		glyphs,
		height: Math.round(set.height * factor),
		medianWidth: Math.round(set.medianWidth * factor),
	};
}

/** Crop a grayscale mat to the tight bounds of its above-threshold pixels. */
function tightCropGray(gray: Mat, threshold: number): Mat {
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
		return out;
	}
	const view = gray.roi(
		new cv.Rect(xMin, yMin, xMax - xMin + 1, yMax - yMin + 1),
	);
	view.copyTo(out);
	view.delete();
	return out;
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
	if (best < 0 || bestRatio > 0.45) return [seg];
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
}

function measureSegment(binary: Mat, seg: Segment): SegmentInfo {
	const { cols, data, rows } = binary;
	let ink = 0;
	let yMin = rows;
	let yMax = -1;
	for (let y = 0; y < rows; y++) {
		for (let x = seg.x0; x < seg.x1; x++) {
			if (data[y * cols + x]! > 0) {
				ink++;
				if (y < yMin) yMin = y;
				if (y > yMax) yMax = y;
			}
		}
	}
	return {
		...seg,
		ink,
		height: Math.max(0, yMax - yMin + 1),
		y0: Math.min(yMin, rows),
		y1: yMax + 1,
	};
}

/**
 * Fixture crops are ground truth; a font glyph must beat one by this margin
 * (stops 'I' noise-edging out an exact 'l' crop). Keep tight: at 0.04 a fixture
 * crop of a different char ('h' vs 'b') can displace a correct font match.
 */
const FIXTURE_TIEBREAK = 0.02;

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

function classifySegment(
	masked: Mat,
	seg: SegmentInfo,
	set: GlyphSet,
	/**
	 * Exact early-reject floor: a score never exceeds its precomputed bound, so a
	 * caller only asking whether any glyph can beat `scoreFloor` (mergeSplitGlyphs)
	 * lets the bound-sorted loop stop early. Computed scores are identical, but
	 * sub-floor candidates are omitted, so pass it only for probes.
	 */
	scoreFloor = Number.NEGATIVE_INFINITY,
): { char: string; score: number; ncc: number; source: "fixture" | "font" }[] {
	const cv = getCV();
	const segWidth = seg.x1 - seg.x0;
	const pad = 5;
	// NB: Mat dimension/data accessors go through embind (validateThis etc.)
	// and are expensive — hoist them out of the per-glyph/per-pixel loops.
	const maskedRows = masked.rows;
	const x0 = Math.max(0, seg.x0 - pad);
	const x1 = Math.min(masked.cols, seg.x1 + pad);
	const regionCols = x1 - x0;
	// Crop the search region vertically to the segment's ink rows: line crops can
	// run far taller than the text (the death tag band is ~2x its glyphs) and every
	// extra row multiplies matchTemplate work. The slack keeps every hRatio-eligible
	// template (tRows <= 1.3 * seg.height) placeable.
	const vSlack = Math.ceil(0.15 * seg.height) + 2;
	const y0 = Math.max(0, seg.y0 - vSlack);
	const y1 = Math.min(maskedRows, seg.y1 + vSlack);
	const regionRows = y1 - y0;
	const region = masked.roi(new cv.Rect(x0, y0, regionCols, regionRows));

	// Both penalty factors depend only on glyph and segment, and NCC <= 1, so
	// their product bounds a glyph's score before matching. Matching in
	// descending-bound order lets the loop stop once no remaining glyph could
	// come within FIXTURE_TIEBREAK of the best.
	const eligible: EligibleGlyph[] = [];
	for (const glyph of set.glyphs) {
		const t = glyph.mat;
		const tRows = t.rows;
		const tCols = t.cols;
		if (tRows > regionRows || tCols > regionCols) continue;
		const wRatio = tCols / Math.max(segWidth, 1);
		if (wRatio < 0.4 || wRatio > 2.5) continue;
		const hRatio = tRows / Math.max(seg.height, 1);
		// a template sliding freely in a taller region can score high on a fragment
		// of the segment (an 'l' bar inside a 'c'), so reject height mismatches
		if (hRatio < 0.5 || hRatio > 1.3) continue;
		// ink-coverage penalty: templates should explain the segment's ink
		const r =
			Math.min(glyph.ink, seg.ink) / Math.max(Math.max(glyph.ink, seg.ink), 1);
		// height-mismatch penalty: an x-height template on an ascender/descender
		// glyph ('o' on 'b') correlates well on the bowl alone
		const hr =
			Math.min(tRows, seg.height) / Math.max(tRows, Math.max(seg.height, 1));
		eligible.push({
			glyph,
			tRows,
			tCols,
			r,
			hr,
			bound: (0.7 + 0.3 * r) * (0.85 + 0.15 * hr),
		});
	}
	eligible.sort((a, b) => b.bound - a.bound);

	const result = new cv.Mat();
	const candidates: {
		char: string;
		score: number;
		ncc: number;
		source: "fixture" | "font";
	}[] = [];
	// Only placements covering most of the segment: the region is padded, so a
	// free-sliding template can otherwise match the *neighboring* glyph inside
	// the pad ('l' next to a narrow 'i' at 0.97+) or a fragment ('t' stem on 'b').
	const minOverlap = 0.7 * segWidth;
	// In probe mode only "can any glyph beat the floor" matters, so the loop stops
	// once either answer is certain.
	const probeMode = scoreFloor !== Number.NEGATIVE_INFINITY;
	// a probe prunes against its own floor instead of the front-runner: its usual
	// answer is "nothing clears the floor", which otherwise costs a full match of
	// every template whose loose bound exceeds it
	const contenders =
		eligible.length >= PRESCREEN_MIN_ELIGIBLE
			? prescreen(
					region,
					eligible,
					{
						x0,
						segX0: seg.x0,
						segX1: seg.x1,
						minOverlap,
					},
					probeMode ? scoreFloor : null,
				)
			: eligible;
	let bestScore = scoreFloor;
	for (const { glyph, tRows, tCols, r, hr, bound } of contenders) {
		if (bound < bestScore - FIXTURE_TIEBREAK) break;
		if (probeMode && (bound <= scoreFloor || bestScore > scoreFloor)) break;
		cv.matchTemplate(region, glyph.mat, result, cv.TM_CCOEFF_NORMED);
		const rCols = regionCols - tCols + 1;
		const rRows = regionRows - tRows + 1;
		// overlap(sx) is concave in sx, so the valid placements form one
		// contiguous rx interval — find its edges, then scan row-major
		const overlapAt = (rx: number) =>
			Math.min(x0 + rx + tCols, seg.x1) - Math.max(x0 + rx, seg.x0);
		let lo = 0;
		while (lo < rCols && overlapAt(lo) < minOverlap) lo++;
		let hi = rCols - 1;
		while (hi >= lo && overlapAt(hi) < minOverlap) hi--;
		if (hi < lo) continue;
		let maxVal = Number.NEGATIVE_INFINITY;
		const scores = result.data32F;
		for (let ry = 0, rowBase = 0; ry < rRows; ry++, rowBase += rCols) {
			for (let rx = lo; rx <= hi; rx++) {
				const v = scores[rowBase + rx]!;
				if (v > maxVal) maxVal = v;
			}
		}
		const score = maxVal * (0.7 + 0.3 * r) * (0.85 + 0.15 * hr);
		if (Number.isFinite(score)) {
			if (score > bestScore) bestScore = score;
			candidates.push({
				char: glyph.char,
				score,
				ncc: maxVal,
				source: glyph.source,
			});
		}
	}
	result.delete();
	region.delete();
	candidates.sort((a, b) => b.score - a.score);
	const top = candidates[0];
	if (top && top.source === "font") {
		const fixture = candidates.find(
			(c) =>
				c.source === "fixture" &&
				top.score - c.score < FIXTURE_TIEBREAK &&
				// ...only when the fixture's raw correlation is also competitive: a fixture
				// crop of a *different* char landing near the top via the ink penalty must
				// not displace a well-matching font glyph
				top.ncc - c.ncc < FIXTURE_TIEBREAK,
		);
		if (fixture && fixture !== top) {
			candidates.splice(candidates.indexOf(fixture), 1);
			candidates.unshift(fixture);
		}
	}
	return candidates.slice(0, 5);
}

interface EligibleGlyph {
	glyph: Glyph;
	tRows: number;
	tCols: number;
	r: number;
	hr: number;
	bound: number;
}

/**
 * Low-res ranking pass over an oversized eligibility list; see PRESCREEN_*.
 * `geometry` carries the caller's placement window in full-res coordinates:
 * without the same min-overlap restriction a template scoring on the neighbor
 * inside the pad inflates the front-runner and prunes the true glyph.
 */
function prescreen(
	region: Mat,
	eligible: EligibleGlyph[],
	geometry: { x0: number; segX0: number; segX1: number; minOverlap: number },
	/** probe mode: prune against this floor instead of the front-runner */
	probeFloor: number | null = null,
): EligibleGlyph[] {
	const cv = getCV();
	const smallRegion = new cv.Mat();
	cv.resize(
		region,
		smallRegion,
		scaledSize(region.cols, region.rows),
		0,
		0,
		cv.INTER_AREA,
	);
	const x0 = geometry.x0 * PRESCREEN_SCALE;
	const segX0 = geometry.segX0 * PRESCREEN_SCALE;
	const segX1 = geometry.segX1 * PRESCREEN_SCALE;
	// the slack pixel keeps quantized low-res placements from cutting a
	// boundary placement the full-res window allows
	const minOverlap = geometry.minOverlap * PRESCREEN_SCALE - 1;
	const result = new cv.Mat();
	// entries the low-res pass cannot estimate (degenerate template or no valid
	// placement after scaling) are force-kept but stay out of the front-runner
	// max, or their untightened bound (≈1) prunes every estimated glyph
	const kept: EligibleGlyph[] = [];
	const scored: { entry: EligibleGlyph; est: number }[] = [];
	for (const entry of eligible) {
		const small = smallGlyph(entry.glyph);
		if (
			small.rows < 2 ||
			small.cols < 2 ||
			small.rows > smallRegion.rows ||
			small.cols > smallRegion.cols
		) {
			kept.push(entry);
			continue;
		}
		cv.matchTemplate(smallRegion, small, result, cv.TM_CCOEFF_NORMED);
		const rCols = smallRegion.cols - small.cols + 1;
		const rRows = smallRegion.rows - small.rows + 1;
		const overlapAt = (rx: number) =>
			Math.min(x0 + rx + small.cols, segX1) - Math.max(x0 + rx, segX0);
		let lo = 0;
		while (lo < rCols && overlapAt(lo) < minOverlap) lo++;
		let hi = rCols - 1;
		while (hi >= lo && overlapAt(hi) < minOverlap) hi--;
		if (hi < lo) {
			kept.push(entry);
			continue;
		}
		let maxVal = Number.NEGATIVE_INFINITY;
		const scores = result.data32F;
		for (let ry = 0, rowBase = 0; ry < rRows; ry++, rowBase += rCols) {
			for (let rx = lo; rx <= hi; rx++) {
				const v = scores[rowBase + rx]!;
				if (v > maxVal) maxVal = v;
			}
		}
		scored.push({ entry, est: maxVal * entry.bound });
	}
	result.delete();
	smallRegion.delete();
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

function smallGlyph(glyph: Glyph): Mat {
	if (!glyph.small) {
		const cv = getCV();
		const small = new cv.Mat();
		cv.resize(
			glyph.mat,
			small,
			scaledSize(glyph.mat.cols, glyph.mat.rows),
			0,
			0,
			cv.INTER_AREA,
		);
		glyph.small = small;
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

interface ClassifiedSegment {
	seg: SegmentInfo;
	ranked: ReturnType<typeof classifySegment>;
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

function mergeSplitGlyphs(
	items: ClassifiedSegment[],
	binary: Mat,
	masked: Mat,
	set: GlyphSet,
): void {
	const maxGap = Math.max(3, Math.round(set.medianWidth * MERGE_MAX_GAP_RATIO));
	const maxCharWidth = Math.round(set.medianWidth * 1.5);
	for (let i = 0; i + 1 < items.length; ) {
		const a = items[i]!;
		const b = items[i + 1]!;
		const gap = b.seg.x0 - a.seg.x1;
		const width = b.seg.x1 - a.seg.x0;
		if (gap > maxGap || width > maxCharWidth) {
			i++;
			continue;
		}
		const seg = measureSegment(binary, { x0: a.seg.x0, x1: b.seg.x1 });
		const fragmentBest = Math.max(
			a.ranked[0]?.score ?? 0,
			b.ranked[0]?.score ?? 0,
		);
		const floor = fragmentBest + MERGE_MARGIN;
		// Probe with the floor first: most neighbor pairs are genuine letter pairs
		// whose merge can't win, so the bound-sorted matching stops almost at once.
		// Probe scores are exact, so "nothing beats the floor" is definitive.
		const probe = classifySegment(masked, seg, set, floor);
		let merged = false;
		if (probe.some((c) => c.score > floor)) {
			// full run (rare): the winning merge's ranked list must also carry
			// the sub-floor runner-up candidates downstream consumers see
			const ranked = classifySegment(masked, seg, set);
			if ((ranked[0]?.score ?? 0) > floor) {
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

function recutMiscutPairs(
	items: ClassifiedSegment[],
	profile: number[],
	binary: Mat,
	masked: Mat,
	set: GlyphSet,
): void {
	const maxGap = Math.max(3, Math.round(set.medianWidth * MERGE_MAX_GAP_RATIO));
	for (let i = 0; i + 1 < items.length; i++) {
		const a = items[i]!;
		const b = items[i + 1]!;
		const aScore = a.ranked[0]?.score ?? 0;
		const bScore = b.ranked[0]?.score ?? 0;
		if (aScore >= RECUT_MAX_SCORE || bScore >= RECUT_MAX_SCORE) continue;
		if (b.seg.x0 - a.seg.x1 > maxGap) continue;
		let floor = Math.max(
			RECUT_MIN_SCORE,
			Math.max(aScore, bScore) + RECUT_MARGIN,
		);
		let best: [ClassifiedSegment, ClassifiedSegment] | null = null;
		for (const cut of dipCuts(profile, a.seg.x0, b.seg.x1)) {
			// a cut inside the existing gap reproduces the original pair
			if (cut >= a.seg.x1 && cut <= b.seg.x0) continue;
			const left = measureSegment(binary, { x0: a.seg.x0, x1: cut });
			const right = measureSegment(binary, { x0: cut, x1: b.seg.x1 });
			// probe with the floor first (see mergeSplitGlyphs): most candidate
			// cuts can't beat it and the probes early-stop almost immediately
			const canWin = (seg: SegmentInfo) =>
				classifySegment(masked, seg, set, floor).some((c) => c.score > floor);
			if (!canWin(left) || !canWin(right)) continue;
			const leftRanked = classifySegment(masked, left, set);
			const rightRanked = classifySegment(masked, right, set);
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
		if (best) items.splice(i, 2, ...best);
	}
}

/** Recognizes white-on-dark text in a grayscale crop tight to one text line. */
export function recognizeText(
	gray: Mat,
	set: GlyphSet,
	options: RecognizeOptions = {},
): RecognizedText {
	const cv = getCV();
	const {
		binThreshold = 150,
		minColumnPixels = 1,
		spaceGap = Math.max(5, Math.round(set.medianWidth * 0.55)),
		minCharScore = 0.4,
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

	const profile = columnProfile(binary);
	const segments = segmentColumns(profile, minColumnPixels)
		.flatMap((s) => splitWideSegment(profile, s, set.medianWidth))
		.map((s) => measureSegment(binary, s));

	const items: ClassifiedSegment[] = segments.map((seg) => ({
		seg,
		ranked: classifySegment(masked, seg, set),
	}));
	mergeSplitGlyphs(items, binary, masked, set);
	recutMiscutPairs(items, profile, binary, masked, set);

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
