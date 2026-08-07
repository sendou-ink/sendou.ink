/**
 * ALL objective-counter ROI coordinates, in canonical 1920x1080 space.
 * Calibrated against the objective/ fixtures (pixel maps over the
 * top-center band). Layout is only roughly mirror-symmetric around x=960
 * (widest digit run "100" measures x816..888 left, x1039..1112 right), so
 * score/plate-probe ROIs are measured per side, not mirrored.
 *
 * One counter plate per team flanks the mode's objective badge under the
 * timer strip: small localized label line over big BlitzBold count
 * digits (~41px). The controlling team's plate fills team-color; a
 * non-controlling team (or both while neutral) is near-black with digits
 * in team ink — the fill swap, not digit values, identifies control. A
 * penalty adds a dark pill under the plate with a white "+N" (~29px).
 */
import { CANONICAL_WIDTH, type Roi } from "../../canonical";

/** Mirror a left-side ROI across the frame's vertical center line. */
function mirrorRoi(roi: Roi): Roi {
	return { ...roi, x: CANONICAL_WIDTH - roi.x - roi.w };
}

/**
 * Count digit band inside the plate below the label line. Wide enough
 * for the full "100" run each side (x816..888 left, x1039..1112 right),
 * clear of the plate rims (edge glow against a bright scene reads as ink).
 */
export const SCORE_ROIS: readonly [Roi, Roi] = [
	{ x: 810, y: 156, w: 90, h: 46 },
	{ x: 1034, y: 156, w: 84, h: 46 },
];

/**
 * Penalty "+N" band inside the pill. The pill measures x 826..920,
 * y 218..256 under the left plate; the band leaves the rounded ends out.
 */
export const PENALTY_ROIS: readonly [Roi, Roi] = (() => {
	const left: Roi = { x: 832, y: 220, w: 82, h: 36 };
	return [left, mirrorRoi(left)];
})();

/**
 * Plate-fill probe strips inside each plate's LEFT rim, clear of the
 * widest digit run (right strip isn't mirrored since that digit run
 * reaches x1112). Both plate styles are a flat fill there (team color in
 * control, near-black otherwise), so the gate accepts flatness (std)
 * alone — fill brightness spans near-black to bright yellow.
 */
export const PLATE_PROBE_ROIS: readonly [Roi, Roi] = [
	{ x: 800, y: 162, w: 10, h: 30 },
	{ x: 1021, y: 162, w: 10, h: 30 },
];

/**
 * Penalty-pill presence probes at the pill's rounded ends, clear of the
 * widest "+100": translucent fill reads mid-dark and flat over any scene.
 */
export const PENALTY_PROBE_ROIS: readonly [[Roi, Roi], [Roi, Roi]] = (() => {
	const leftPill: [Roi, Roi] = [
		{ x: 828, y: 226, w: 8, h: 24 },
		{ x: 910, y: 226, w: 8, h: 24 },
	];
	return [leftPill, [mirrorRoi(leftPill[1]), mirrorRoi(leftPill[0])]];
})();

export const GATE_PLATE_MAX_STD = 30;
/** A count digit's brightest channel clears this on either plate style. */
export const GATE_SCORE_MIN_MAX_BRIGHTNESS = 200;

/**
 * Gate anchor: the match timer above the plates — white M:SS digits in a
 * near-black box only the in-match HUD draws. In-match HUD reads <=30 on
 * each dark probe; every other screen lights one past 70. Turf War and
 * the death cam (one centered pill) also show a timer — there the plate
 * probes and no-readable-count parse confirmation carry the rejection.
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
 * Timer's white M:SS digits measure 34px; the colon's dots stack under
 * the digit height floor, so a plain height filter drops the colon.
 */
export const TIMER_TEXT_HEIGHT = 34;
export const TIMER_BIN_THRESHOLD = 160;
export const TIMER_DIGIT_MIN_CONF = 0.75;
export const TIMER_DIGIT_MIN_HEIGHT_RATIO = 0.82;

/**
 * Count digits measure ~40-44px across attested plates; both scaled sets
 * are tried, best trailing read wins (banner's settled/mid-pop pattern).
 */
export const SCORE_TEXT_HEIGHTS = [40, 44] as const;
export const PENALTY_TEXT_HEIGHT = 29;

/**
 * Binarization thresholds vary with plate style (team-ink ~200+ on ~45
 * black; white ~250 on team fills up to ~130 gray) — each read keeps its best.
 */
export const SCORE_BIN_THRESHOLDS = [160, 190] as const;

/** Penalty pill: white digits on the translucent dark fill (~100 gray). */
export const PENALTY_BIN_THRESHOLD = 170;
export const PENALTY_PROBE_MAX_MEAN = 165;
export const PENALTY_PROBE_MAX_STD = 30;

/**
 * Control = plate fill is team-color style (measured over the probe
 * strip): even dark inks (deep blue ~130 spread at ~50 brightness) stay
 * saturated, while a non-controlling/neutral plate is unsaturated
 * (attested fills >=112 vs <=19).
 */
export const CONTROL_PLATE_MIN_SATURATION = 60;
