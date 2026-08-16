/**
 * Weapon icon identification: NCC of every candidate icon (pre-scaled to a
 * few sizes) against the row's weapon ROI, with an ink-coverage penalty so a
 * small template can't win by matching a lucky sub-window of a bigger icon
 * (the template's opaque area should match the ink actually present).
 *
 * Large template sets run coarse-to-fine: every icon first ranked at quarter
 * resolution (same scoring), then only the shortlist re-matched at full res.
 * Small sets (ability badges) skip the coarse pass — not worth it below ~2x
 * the shortlist size.
 */
import { getCV, type Mat, minMaxLoc } from "../../cv";
import type { FrameData } from "../../image";

/**
 * Icon heights (px at 1080p) to try. The live scoreboard renders in-row
 * icons at ~44-56px; the replay browser at ~60-64px. The oversized entries
 * are skipped inside the live detector's 56px-tall weapon ROI at match
 * time, so they only ever compete on the replay screen.
 */
const WEAPON_TEMPLATE_SIZES = [40, 44, 48, 52, 56, 60, 64] as const;

/** Row pill background the icons sit on (near-black). */
const PILL_BACKGROUND = 12;

/** Pixels brighter than this count as icon ink (pill is ~10-15). */
const INK_THRESHOLD = 40;

/**
 * Scoped chargers' icons differ from their unscoped twins only by the scope
 * tube, which is near-black and sits on the near-black pill — measurably
 * invisible at ~50px (a synthetic scoped row probes *darker* in the scope
 * band than a real unscoped row does from barrel bleed). When the two
 * variants score within noise of each other, resolve to the unscoped one
 * (matches labeled fixtures and typical usage) and flag the ambiguity.
 * Map: scoped id -> unscoped id.
 */
const SCOPED_TWINS: ReadonlyMap<string, string> = new Map([
	["2040", "2030"], // Splat Scope -> Splat Charger
	["2041", "2031"], // Z+F variants
	["2070", "2060"], // E-liter 4K Scope -> E-liter 4K
	["2071", "2061"], // Custom variants
]);
const TWIN_MARGIN = 0.05;

/** Coarse-pass resolution, relative to full templates. */
const COARSE_SCALE = 0.25;
/** How many coarse-ranked ids survive into the full-resolution pass. */
const COARSE_SHORTLIST = 16;

export interface TemplateSize {
	mat: Mat;
	ink: number;
	/** the same template at COARSE_SCALE, for the coarse ranking pass */
	coarse: { mat: Mat; ink: number };
}

export interface WeaponTemplate {
	id: string;
	/** RGB template + ink pixel count at each candidate size */
	sizes: TemplateSize[];
}

export interface WeaponMatch {
	id: string;
	score: number;
	/** best candidates, most likely first (3 unless options.topN says more) */
	top: { id: string; score: number }[];
	/** true when a scoped/unscoped twin tie was resolved by the unscoped prior */
	twinAmbiguous?: boolean;
	/** true when a near-tie was re-ranked by the row's special icon (specials.ts) */
	specialResolved?: boolean;
	/** true when a near-tie was re-ranked by the minimap sub tile (specials.ts) */
	subResolved?: boolean;
}

/** Icon-ink pixel count of a continuous RGB mat (NOT an ROI view). */
function countInkRgb(mat: Mat, threshold: number): number {
	let ink = 0;
	const d = mat.data;
	const n = mat.rows * mat.cols;
	for (let i = 0; i < n; i++) {
		const v = Math.max(d[i * 3]!, d[i * 3 + 1]!, d[i * 3 + 2]!);
		if (v > threshold) ink++;
	}
	return ink;
}

/**
 * Downscale a composited RGB icon to each candidate size, with the coarse
 * variant and ink counts matchWeapon needs. Ink is counted on the resized
 * pixels, not scaled from source alpha (which undercounts antialiased edges
 * and can flip the coverage ratio toward a wrong icon).
 *
 * `referenceSize` scales by size/referenceSize instead of resizing to a
 * size×size square — "the art as it renders inside a size-sized padded
 * square" — letting a template whose icon square is taller than the ROI
 * still compete when its art fits (see prepareWeaponTemplates cropToArt).
 */
export function buildTemplateSizes(
	composited: Mat,
	sizes: readonly number[],
	inkThreshold: number,
	referenceSize?: number,
): TemplateSize[] {
	const cv = getCV();
	return sizes.map((size) => {
		const mat = new cv.Mat();
		if (referenceSize) {
			const scale = size / referenceSize;
			cv.resize(
				composited,
				mat,
				new cv.Size(
					Math.max(1, Math.round(composited.cols * scale)),
					Math.max(1, Math.round(composited.rows * scale)),
				),
				0,
				0,
				cv.INTER_AREA,
			);
		} else {
			cv.resize(composited, mat, new cv.Size(size, size), 0, 0, cv.INTER_AREA);
		}
		const coarseMat = new cv.Mat();
		cv.resize(
			mat,
			coarseMat,
			new cv.Size(0, 0),
			COARSE_SCALE,
			COARSE_SCALE,
			cv.INTER_AREA,
		);
		return {
			mat,
			ink: countInkRgb(mat, inkThreshold),
			coarse: { mat: coarseMat, ink: countInkRgb(coarseMat, inkThreshold) },
		};
	});
}

/**
 * Build match-ready templates from raw RGBA icon images (256x256 with
 * alpha): composite over the pill background, then downscale to each size.
 * Screens whose pills aren't near-black (minimap cards, camo surfaces)
 * override `background` and `inkThreshold` (must clear the new background
 * or ink counts saturate).
 *
 * `cropToArt` trims each template to the icon's alpha bbox (source icons
 * carry generous transparent padding) while keeping the padded-square scale
 * semantics — without it, a screen rendering icons near the ROI height
 * (minimap cards, ~56-60px in a 54px box) can never match, since matchWeapon
 * skips templates taller/wider than the ROI.
 */
export function prepareWeaponTemplates(
	icons: { id: string; image: FrameData }[],
	templateSizes: readonly number[] = WEAPON_TEMPLATE_SIZES,
	options: {
		background?: number;
		inkThreshold?: number;
		cropToArt?: boolean;
	} = {},
): WeaponTemplate[] {
	const cv = getCV();
	const background = options.background ?? PILL_BACKGROUND;
	const inkThreshold = options.inkThreshold ?? INK_THRESHOLD;
	return icons.map(({ id, image }) => {
		const rgba = cv.matFromImageData(image as unknown as ImageData);
		const source = options.cropToArt ? cropToAlphaBbox(rgba) : rgba;
		const composited = compositeOnBackground(source, background);
		if (source !== rgba) source.delete();
		const referenceSize = options.cropToArt ? rgba.cols : undefined;
		rgba.delete();
		const sizes = buildTemplateSizes(
			composited,
			templateSizes,
			inkThreshold,
			referenceSize,
		);
		composited.delete();
		return { id, sizes };
	});
}

/** Alpha threshold and margin (source px) for the cropToArt bounding box. */
const ART_ALPHA_MIN = 32;
const ART_BBOX_MARGIN = 6;

function cropToAlphaBbox(rgba: Mat): Mat {
	const cv = getCV();
	const d = rgba.data;
	const cols = rgba.cols;
	const rows = rgba.rows;
	let x0 = cols;
	let y0 = rows;
	let x1 = -1;
	let y1 = -1;
	for (let y = 0; y < rows; y++) {
		const rowBase = y * cols * 4 + 3;
		for (let x = 0; x < cols; x++) {
			if (d[rowBase + x * 4]! >= ART_ALPHA_MIN) {
				if (x < x0) x0 = x;
				if (x > x1) x1 = x;
				if (y < y0) y0 = y;
				if (y > y1) y1 = y;
			}
		}
	}
	if (x1 < 0) {
		const copy = new cv.Mat();
		rgba.copyTo(copy);
		return copy;
	}
	x0 = Math.max(0, x0 - ART_BBOX_MARGIN);
	y0 = Math.max(0, y0 - ART_BBOX_MARGIN);
	x1 = Math.min(cols - 1, x1 + ART_BBOX_MARGIN);
	y1 = Math.min(rows - 1, y1 + ART_BBOX_MARGIN);
	const view = rgba.roi(new cv.Rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1));
	const out = new cv.Mat();
	view.copyTo(out); // ROI views: .data/.clone broken in this build, copy out
	view.delete();
	return out;
}

function compositeOnBackground(rgba: Mat, background: number): Mat {
	const cv = getCV();
	const out = new cv.Mat(rgba.rows, rgba.cols, cv.CV_8UC3);
	const src = rgba.data;
	const dst = out.data;
	const n = rgba.rows * rgba.cols;
	for (let i = 0; i < n; i++) {
		const a = src[i * 4 + 3]! / 255;
		dst[i * 3] = Math.round(src[i * 4]! * a + background * (1 - a));
		dst[i * 3 + 1] = Math.round(src[i * 4 + 1]! * a + background * (1 - a));
		dst[i * 3 + 2] = Math.round(src[i * 4 + 2]! * a + background * (1 - a));
	}
	return out;
}

/**
 * Coarse pass: rank every template by its best quarter-resolution score
 * (same NCC + ink-coverage formula as the full pass) and return the
 * COARSE_SHORTLIST ids worth full-resolution matching. Scoped ids drag
 * their unscoped twin along so the twin tie-break always has both scores.
 * Returns null when no coarse template fits (caller falls back to the
 * full set, which then skips the same templates and reports unknown).
 */
function coarseShortlist(
	searchRgb: Mat,
	templates: WeaponTemplate[],
	inkThreshold: number,
): Set<string> | null {
	const cv = getCV();
	const region = new cv.Mat();
	cv.resize(
		searchRgb,
		region,
		new cv.Size(0, 0),
		COARSE_SCALE,
		COARSE_SCALE,
		cv.INTER_AREA,
	);
	const searchInk = countInkRgb(region, inkThreshold);

	const result = new cv.Mat();
	const scored: { id: string; score: number }[] = [];
	const searchRows = searchRgb.rows;
	const searchCols = searchRgb.cols;
	const regionRows = region.rows;
	const regionCols = region.cols;
	for (const template of templates) {
		let score = -1;
		for (const { mat, coarse } of template.sizes) {
			// gate on the *full-res* dims so a size competes here iff it competes
			// in the full pass, then also require the coarse pair to fit
			if (mat.rows > searchRows || mat.cols > searchCols) continue;
			if (coarse.mat.rows > regionRows || coarse.mat.cols > regionCols)
				continue;
			cv.matchTemplate(region, coarse.mat, result, cv.TM_CCOEFF_NORMED);
			const { maxVal } = minMaxLoc(result);
			const r =
				Math.min(coarse.ink, searchInk) /
				Math.max(Math.max(coarse.ink, searchInk), 1);
			const adjusted = maxVal * (0.75 + 0.25 * r);
			if (adjusted > score) score = adjusted;
		}
		if (score > -1) scored.push({ id: template.id, score });
	}
	result.delete();
	region.delete();
	if (scored.length === 0) return null;

	scored.sort((a, b) => b.score - a.score);
	const ids = new Set(scored.slice(0, COARSE_SHORTLIST).map((s) => s.id));
	for (const id of [...ids]) {
		const twin = SCOPED_TWINS.get(id);
		if (twin) ids.add(twin);
	}
	return ids;
}

/**
 * searchRgb: RGB crop of the row's weapon ROI (view is fine).
 * inkThreshold separates icon ink from the pill background in the search
 * region — raise it on screens whose pills are lighter than the live
 * scoreboard's (~12), e.g. the replay browser (~61), or everything counts
 * as ink and the coverage penalty collapses.
 */
export function matchWeapon(
	searchRgb: Mat,
	templates: WeaponTemplate[],
	options: { inkThreshold?: number; topN?: number } = {},
): WeaponMatch {
	const cv = getCV();
	const inkThreshold = options.inkThreshold ?? INK_THRESHOLD;
	const topN = options.topN ?? 3;

	// icon ink present in the search region (pixel access needs a copy)
	const cont = new cv.Mat();
	searchRgb.copyTo(cont);
	const searchInk = countInkRgb(cont, inkThreshold);
	cont.delete();

	// shortlist large sets at coarse resolution first; below ~2x the shortlist
	// size the coarse pass costs more calls than it saves
	let pool = templates;
	if (templates.length > COARSE_SHORTLIST * 2) {
		const ids = coarseShortlist(searchRgb, templates, inkThreshold);
		if (ids) pool = templates.filter((t) => ids.has(t.id));
	}

	const result = new cv.Mat();
	const best = new Map<string, number>();
	const searchRows = searchRgb.rows;
	const searchCols = searchRgb.cols;
	for (const template of pool) {
		let score = -1;
		for (const { mat, ink } of template.sizes) {
			if (mat.rows > searchRows || mat.cols > searchCols) continue;
			cv.matchTemplate(searchRgb, mat, result, cv.TM_CCOEFF_NORMED);
			const { maxVal } = minMaxLoc(result);
			const r =
				Math.min(ink, searchInk) / Math.max(Math.max(ink, searchInk), 1);
			const adjusted = maxVal * (0.75 + 0.25 * r);
			if (adjusted > score) score = adjusted;
		}
		best.set(template.id, score);
	}
	result.delete();
	const ranked = [...best.entries()]
		.map(([id, score]) => ({ id, score }))
		.sort((a, b) => b.score - a.score);
	const top = ranked.slice(0, topN);
	let first = top[0] ?? { id: "unknown", score: -1 };
	let twinAmbiguous = false;
	const unscopedId = SCOPED_TWINS.get(first.id);
	if (unscopedId) {
		const twin = ranked.find((r) => r.id === unscopedId);
		if (twin && first.score - twin.score < TWIN_MARGIN) {
			twinAmbiguous = true;
			first = twin;
			const i = top.findIndex((t) => t.id === twin.id);
			if (i >= 0) top.splice(i, 1);
			top.unshift(twin);
			top.length = Math.min(top.length, topN);
		}
	}
	return { id: first.id, score: first.score, top, twinAmbiguous };
}
