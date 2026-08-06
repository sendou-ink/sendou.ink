/**
 * ALL objective-counter ROI coordinates, in canonical 1920x1080 space.
 * Calibrated against the objective/ fixtures (pixel maps over the top-center
 * band; the layout is mirror-symmetric around x=960, so right-side ROIs are
 * derived with mirrorRoi and stay locked to the left-side measurements).
 *
 * The ranked in-match HUD shows one counter plate per team flanking the
 * mode's objective badge, under the timer strip:
 * - each plate is a rounded box with a small localized label line
 *   ("Remaining", のこり, ...) over big BlitzBold count digits (~42px);
 * - the team currently in control has its plate restyled: near-black fill
 *   with the digits in the team's ink color; the other plate keeps a
 *   team-color fill with white digits. The fill/ink swap — not the digit
 *   values — is what identifies control;
 * - a penalty adds a translucent dark pill under the plate with a white
 *   "+N" (~26px digits; the '+' is shorter than any digit and is dropped by
 *   the trailing-digit height floor).
 *
 * Only one fixture is attested so far (SZ, two-digit counts on both sides).
 * Assumed until more fixtures land: the plates keep their geometry with
 * three-digit counts ("100"), and the penalty pill sits mirror-symmetric
 * under the right plate.
 */
import { CANONICAL_WIDTH, type Roi } from "../../canonical";

/** Mirror a left-side ROI across the frame's vertical center line. */
function mirrorRoi(roi: Roi): Roi {
	return { ...roi, x: CANONICAL_WIDTH - roi.x - roi.w };
}

/** Count digit band, inside the plate below the label line. */
export const SCORE_ROIS: readonly [Roi, Roi] = (() => {
	const left: Roi = { x: 812, y: 156, w: 84, h: 50 };
	return [left, mirrorRoi(left)];
})();

/**
 * Penalty "+N" band inside the pill. The pill measures x 826..920,
 * y 218..256 under the left plate; the band leaves the rounded ends out.
 */
export const PENALTY_ROIS: readonly [Roi, Roi] = (() => {
	const left: Roi = { x: 832, y: 220, w: 82, h: 36 };
	return [left, mirrorRoi(left)];
})();

/**
 * Plate-fill probe strips at the plates' outer edges (x 796..903 is the
 * left plate; the strip sits inside its left rim, clear of the widest
 * attested digit run). Both plate styles are a flat fill there — near-black
 * when in control, saturated team color when not — while gameplay showing
 * through a lookalike frame is busy: the gate accepts a strip on mean
 * brightness plus flatness (std).
 */
export const PLATE_PROBE_ROIS: readonly [Roi, Roi] = (() => {
	const left: Roi = { x: 800, y: 162, w: 10, h: 36 };
	return [left, mirrorRoi(left)];
})();

/**
 * Penalty-pill presence probes at the pill's rounded ends, clear of the
 * widest expected "+100": the translucent fill reads mid-dark and flat
 * over any scene.
 */
export const PENALTY_PROBE_ROIS: readonly [[Roi, Roi], [Roi, Roi]] = (() => {
	const leftPill: [Roi, Roi] = [
		{ x: 828, y: 226, w: 8, h: 24 },
		{ x: 910, y: 226, w: 8, h: 24 },
	];
	return [leftPill, [mirrorRoi(leftPill[1]), mirrorRoi(leftPill[0])]];
})();

export const GATE_PLATE_MAX_MEAN = 165;
export const GATE_PLATE_MAX_STD = 30;
/** A count digit's brightest channel clears this on either plate style. */
export const GATE_SCORE_MIN_MAX_BRIGHTNESS = 200;

/**
 * The gate's anchor is the match timer above the plates: white M:SS digits
 * in a near-black rounded box that only the in-match HUD draws. Dark probes
 * sit at the box interior's top band and side gaps beyond the digits, the
 * bright probe over the digits themselves. Measured across every current
 * fixture: in-match HUD frames read <=30 on each dark probe while every
 * results/replay/splash/minimap screen lights at least one past 70. The
 * timer also shows in Turf War and on the death cam (which swaps the two
 * plates for one centered pill) — there the plate probes and the
 * no-readable-count parse confirmation carry the rejection.
 */
export const TIMER_DIGIT_ROI: Roi = { x: 908, y: 54, w: 100, h: 40 };
export const TIMER_DARK_PROBES: readonly Roi[] = [
	{ x: 915, y: 45, w: 80, h: 7 },
	{ x: 897, y: 57, w: 8, h: 26 },
	{ x: 1012, y: 57, w: 7, h: 26 },
];
export const GATE_TIMER_MAX_MEAN = 70;
export const GATE_TIMER_MIN_MAX_BRIGHTNESS = 240;

/**
 * The timer's white M:SS digits measure 34px in the attested fixture; the
 * colon's two dots stack to well under the digit height floor, so a plain
 * height filter drops the colon and leaves the M SS digits.
 */
export const TIMER_TEXT_HEIGHT = 34;
export const TIMER_BIN_THRESHOLD = 160;
export const TIMER_DIGIT_MIN_CONF = 0.75;
export const TIMER_DIGIT_MIN_HEIGHT_RATIO = 0.82;

/**
 * Count digits measure ~40-44px across the attested plates; both scaled
 * sets are tried and the best trailing read wins (same pattern as the
 * banner's settled/mid-pop sizes).
 */
export const SCORE_TEXT_HEIGHTS = [40, 44] as const;
export const PENALTY_TEXT_HEIGHT = 26;

/**
 * Binarization thresholds tried per channel extraction. The ink/background
 * pairs vary with plate style (team-color ink ~200+ on ~45 black fill;
 * white ~250 on team fills whose gray sits anywhere up to ~130), so no
 * single threshold works everywhere; each read keeps its best.
 */
export const SCORE_BIN_THRESHOLDS = [160, 190] as const;

/** Penalty pill: white digits on the translucent dark fill (~100 gray). */
export const PENALTY_BIN_THRESHOLD = 170;
export const PENALTY_PROBE_MAX_MEAN = 165;
export const PENALTY_PROBE_MAX_STD = 30;

/**
 * Control = the plate's fill is the near-black style (measured over the
 * plate probe strip): a controlling team's plate is neutral dark — low
 * brightness AND low saturation — while the team-color fill of a
 * non-controlling plate stays saturated even for dark inks (deep blue
 * measures ~130 spread at ~50 brightness).
 */
export const CONTROL_PLATE_MAX_MEAN = 90;
export const CONTROL_PLATE_MAX_SATURATION = 60;
