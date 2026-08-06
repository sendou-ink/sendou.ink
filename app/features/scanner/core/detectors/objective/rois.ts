/**
 * ALL objective-counter ROI coordinates, in canonical 1920x1080 space.
 * Calibrated against the objective/ fixtures (pixel maps over the top-center
 * band). The layout is only roughly mirror-symmetric around x=960: the
 * widest attested digit run ("100") measures x816..888 on the left plate
 * but x1039..1112 on the right — a few px right of mirror-center — so the
 * score and plate-probe ROIs are measured per side instead of mirrored.
 *
 * The ranked in-match HUD shows one counter plate per team flanking the
 * mode's objective badge, under the timer strip:
 * - each plate is a rounded box with a small localized label line
 *   ("Remaining", のこり, ...) over big BlitzBold count digits (~41px);
 * - the team currently in control has its plate in its team-color fill
 *   (digits near-black on bright inks, white on dark inks); a team not in
 *   control — including both teams while the objective is neutral — has a
 *   near-black plate with the digits in its team ink color. The fill swap —
 *   not the digit values — is what identifies control;
 * - a penalty adds a translucent dark pill under the plate with a white
 *   "+N" (~29px digits; the '+' is shorter than any digit and is dropped by
 *   the trailing-digit height floor).
 */
import { CANONICAL_WIDTH, type Roi } from "../../canonical";

/** Mirror a left-side ROI across the frame's vertical center line. */
function mirrorRoi(roi: Roi): Roi {
	return { ...roi, x: CANONICAL_WIDTH - roi.x - roi.w };
}

/**
 * Count digit band, inside the plate below the label line. Wide enough for
 * the full three-digit "100" run on each side (measured x816..888 left,
 * x1039..1112 right) while staying clear of the plate rims, whose edge glow
 * against a bright scene can read as ink.
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
 * Plate-fill probe strips inside each plate's LEFT rim (x 796..903 is the
 * left plate, x 1017..1124 the right), clear of the widest attested digit
 * run ("100", see SCORE_ROIS) — the right strip is not mirrored because the
 * right plate's digit run reaches x1112, into where a mirrored strip would
 * sit. Height stops at y192 to stay above the bottom-corner edge glow.
 * Both plate styles are a flat fill there — saturated team color when in
 * control, near-black when not — while gameplay showing through a
 * lookalike frame is busy: the gate accepts a strip on flatness (std)
 * alone, since fill brightness spans near-black to bright yellow.
 */
export const PLATE_PROBE_ROIS: readonly [Roi, Roi] = [
	{ x: 800, y: 162, w: 10, h: 30 },
	{ x: 1021, y: 162, w: 10, h: 30 },
];

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
export const PENALTY_TEXT_HEIGHT = 29;

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
 * Control = the plate's fill is the team-color style (measured over the
 * plate probe strip): a controlling team's plate keeps its saturated ink
 * fill even for dark inks (deep blue measures ~130 spread at ~50
 * brightness), while the near-black plate of a non-controlling team — or
 * of both teams while the objective is neutral — is unsaturated (attested
 * fills measure >=112 vs <=19).
 */
export const CONTROL_PLATE_MIN_SATURATION = 60;
