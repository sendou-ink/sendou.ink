/**
 * Team ink color sampling and comparison. Splatoon renders each team's UI
 * accents (counter plate fills and digits, minimap sub tiles) in its ink
 * color, fixed for the game and picked to contrast — a per-frame team identity
 * signal where screen position is not one (casts reorder HUD sides).
 */
import type { Mat } from "./cv";
import { copyRoi, type Roi } from "./image";

export interface InkRgb {
	r: number;
	g: number;
	b: number;
}

/** Channel spread (max-min) a pixel needs to count as ink, not chrome. */
const INK_MIN_SATURATION = 60;

/** Fewer qualifying pixels than this = no reliable ink in the ROIs. */
const MIN_INK_PIXELS = 30;

/**
 * Mean RGB of the ink-saturated pixels across the ROIs (channel spread at least
 * `minSaturation`); null when fewer than MIN_INK_PIXELS qualify. Averaging only
 * saturated pixels keeps dark/white surroundings from washing the hue out.
 */
export function meanInkColor(
	frame: Mat,
	rois: readonly Roi[],
	minSaturation: number = INK_MIN_SATURATION,
): InkRgb | null {
	let r = 0;
	let g = 0;
	let b = 0;
	let count = 0;
	for (const roi of rois) {
		const crop = copyRoi(frame, roi);
		const { data } = crop;
		const channels = crop.channels();
		for (let i = 0; i < data.length; i += channels) {
			const pr = data[i]!;
			const pg = data[i + 1]!;
			const pb = data[i + 2]!;
			const spread = Math.max(pr, pg, pb) - Math.min(pr, pg, pb);
			if (spread < minSaturation) continue;
			r += pr;
			g += pg;
			b += pb;
			count++;
		}
		crop.delete();
	}
	if (count < MIN_INK_PIXELS) return null;
	return {
		r: Math.round(r / count),
		g: Math.round(g / count),
		b: Math.round(b / count),
	};
}

/** Hue histogram bin width for dominantInkColor. */
const HUE_BIN_DEGREES = 10;
/** Pixels within this many degrees of the modal hue join its mean color. */
const DOMINANT_HUE_TOLERANCE = 20;
/** Value floor for dominantInkColor: dark saturated backdrop is not UI ink. */
const DOMINANT_INK_MIN_VALUE = 105;

/**
 * Mean RGB of the ink pixels around the ROIs' modal hue: for regions where
 * team ink dominates but other saturated art (weapon renders) is mixed in,
 * which a plain mean would pull off the team's hue. Null on too little ink.
 */
export function dominantInkColor(
	frame: Mat,
	rois: readonly Roi[],
): InkRgb | null {
	const pixels: { r: number; g: number; b: number; hue: number }[] = [];
	for (const roi of rois) {
		const crop = copyRoi(frame, roi);
		const { data } = crop;
		const channels = crop.channels();
		for (let i = 0; i < data.length; i += channels) {
			const color = { r: data[i]!, g: data[i + 1]!, b: data[i + 2]! };
			const max = Math.max(color.r, color.g, color.b);
			const spread = max - Math.min(color.r, color.g, color.b);
			if (spread < INK_MIN_SATURATION || max < DOMINANT_INK_MIN_VALUE) continue;
			pixels.push({ ...color, hue: hueOf(color) });
		}
		crop.delete();
	}
	if (pixels.length < MIN_INK_PIXELS) return null;

	const bins = new Array<number>(360 / HUE_BIN_DEGREES).fill(0);
	for (const { hue } of pixels) {
		bins[Math.floor(hue / HUE_BIN_DEGREES) % bins.length]!++;
	}
	let modeBin = 0;
	let modeCount = -1;
	for (let bin = 0; bin < bins.length; bin++) {
		const count =
			bins[(bin + bins.length - 1) % bins.length]! +
			bins[bin]! +
			bins[(bin + 1) % bins.length]!;
		if (count > modeCount) {
			modeCount = count;
			modeBin = bin;
		}
	}
	const modeHue = (modeBin + 0.5) * HUE_BIN_DEGREES;
	const near = pixels.filter(
		(pixel) => hueDistance(pixel.hue, modeHue) <= DOMINANT_HUE_TOLERANCE,
	);
	if (near.length < MIN_INK_PIXELS) return null;
	return {
		r: Math.round(near.reduce((sum, p) => sum + p.r, 0) / near.length),
		g: Math.round(near.reduce((sum, p) => sum + p.g, 0) / near.length),
		b: Math.round(near.reduce((sum, p) => sum + p.b, 0) / near.length),
	};
}

/** Hue angle of an ink color, degrees on the 0-360 color wheel. */
export function hueOf(color: InkRgb): number {
	const max = Math.max(color.r, color.g, color.b);
	const min = Math.min(color.r, color.g, color.b);
	if (max === min) return 0;
	const d = max - min;
	let h: number;
	if (max === color.r) {
		h = ((color.g - color.b) / d) % 6;
	} else if (max === color.g) {
		h = (color.b - color.r) / d + 2;
	} else {
		h = (color.r - color.g) / d + 4;
	}
	return (h * 60 + 360) % 360;
}

/** Shortest angular distance between two hues, 0-180 degrees. */
export function hueDistance(a: number, b: number): number {
	const d = Math.abs(a - b) % 360;
	return d > 180 ? 360 - d : d;
}
