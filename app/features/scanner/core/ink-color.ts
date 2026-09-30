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
