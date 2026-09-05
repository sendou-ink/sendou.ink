/**
 * POV arrow detection: the recording player's row carries a solid yellow arrow
 * at its left edge (absent on spectator footage). It is the only saturated
 * pure-yellow blob there (team-ink yellows are duller), so a color-mask pixel
 * count decides.
 */
import { getCV, type Mat } from "../../cv";
import { cropRoi, type Roi } from "../../image";

const YELLOW_R_MIN = 190;
const YELLOW_G_MIN = 180;
const YELLOW_B_MAX = 90;
/** Pure arrow yellow has R≈G; team golds/chartreuse skew one channel. */
const YELLOW_RG_MAX_DIFF = 60;

/** Arrow pixels fill ~15-30% of the probe ROI; arrow-less rows measure ~0. */
const POV_MIN_FRACTION = 0.05;
/** A runner-up row at this share of the best means ambient team-ink yellow, not the arrow. */
const POV_RUNNER_UP_MAX_RATIO = 0.5;

/** Fraction of `roi` pixels that are arrow-yellow. `rgb` is a 3-channel RGB mat. */
export function povYellowFraction(rgb: Mat, roi: Roi): number {
	const cv = getCV();
	const view = cropRoi(rgb, roi);
	const cont = new cv.Mat();
	view.copyTo(cont);
	view.delete();
	const d = cont.data;
	const n = cont.rows * cont.cols;
	let yellow = 0;
	for (let i = 0; i < n; i++) {
		const r = d[i * 3]!;
		const g = d[i * 3 + 1]!;
		const b = d[i * 3 + 2]!;
		if (
			r > YELLOW_R_MIN &&
			g > YELLOW_G_MIN &&
			b < YELLOW_B_MAX &&
			Math.abs(r - g) < YELLOW_RG_MAX_DIFF
		) {
			yellow++;
		}
	}
	cont.delete();
	return n > 0 ? yellow / n : 0;
}

/** Arrow row from per-row yellow fractions; null when none clears POV_MIN_FRACTION or the runner-up is close. */
export function findPovIndex(fractions: readonly number[]): number | null {
	let best = -1;
	for (let i = 0; i < fractions.length; i++) {
		if (best < 0 || fractions[i]! > fractions[best]!) best = i;
	}
	if (best < 0 || fractions[best]! < POV_MIN_FRACTION) return null;
	for (let i = 0; i < fractions.length; i++) {
		if (
			i !== best &&
			fractions[i]! > fractions[best]! * POV_RUNNER_UP_MAX_RATIO
		)
			return null;
	}
	return best;
}
