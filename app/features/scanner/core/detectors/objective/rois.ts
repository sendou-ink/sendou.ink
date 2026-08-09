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
 * Timer's white M:SS digits measure 34px on native 1080p footage; upscaled
 * 720p captures draw them at ~40px. Every height is tried and the best
 * valid read wins — the wrong-scale set scores well under a clean read's
 * confidence. The colon's dots stack under the digit height floor at
 * either size, so a plain height filter drops the colon.
 */
export const TIMER_TEXT_HEIGHTS = [34, 40] as const;
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

/**
 * Extension floor for count digits joining a run anchored by a confident
 * one: white digits on a bright control fill blur into the plate on
 * compressed cast footage, eroding a leading digit to 0.64-0.76 while its
 * neighbor still clears the main floor ("50" read as trailing "0" — the
 * Splat World Series lime plates). Noise chars on the same plates matched
 * digit templates at up to 0.66 but never alongside an anchor digit.
 */
export const SCORE_EXTEND_MIN_CONF = 0.6;

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

// ---- player-status icon strips (the PlayerStatus event) ----
//
// Eight per-player squid/octo icons flank the timer. An alive icon's body
// is drawn in team ink; holding special washes the upper body out into a
// bright pale glow; a splatted player's icon turns an unsaturated grey/dark
// X'd shape. Two layouts share the band: POV (small icons) and the casted
// spectator HUD (bigger icons, gauge digits hanging over each icon's
// top-RIGHT and white camera-button badges below) — slot centers are
// measured per side off the fixtures; neither layout is mirror-symmetric
// (POV inner icons sit 108px left / 130px right of screen center) and the
// cast sides don't even share a pitch (~98 left vs ~76 right). Cast icons
// ride their badge columns ~20px left of each badge center; the outer-right
// center sits a few px past the measured icon (~1313) because splat X's
// there lean into inked backdrop on their left while alive bodies extend
// right (attested dead <=0.16 vs alive >=0.33 at 1320).
//
// The cast strip additionally MIRRORS its pitches when the broadcast specs
// a player on the other team (attested mid-game in the AREA CUP VoD): the
// narrow ~76 pitch swaps to the left column and the wide ~97 pitch to the
// right, badges and all — the "cast-mirror" layout. Its right column lands
// within a few px of the POV right column, so a mirrored frame scores
// deceptively well as POV; the mirror's own geometry must be a scored
// candidate (and badge-probed) or the left column misreads ready/dead.
//
// Broadcasts can hide the camera badges while keeping the cast icon
// geometry (attested in the AREA CUP VoD), so badge absence alone cannot
// pick the POV layout — player-status.ts scores both geometries and keeps
// the one whose body reads sit decisively on either side of the dead
// threshold; a mispicked layout puts outer-slot boxes between icons and
// flickers phantom deaths on the outermost players.

/** Per-side slot center x's, slots left-to-right. */
export const STATUS_SLOT_CENTERS_POV: readonly [
	readonly number[],
	readonly number[],
] = [
	[554, 653, 752, 852],
	[1090, 1190, 1288, 1388],
];
export const STATUS_SLOT_CENTERS_CAST: readonly [
	readonly number[],
	readonly number[],
] = [
	[543, 642, 741, 837],
	[1085, 1161, 1237, 1320],
];
export const STATUS_SLOT_CENTERS_CAST_MIRROR: readonly [
	readonly number[],
	readonly number[],
] = [
	[605, 681, 757, 833],
	[1090, 1187, 1283, 1381],
];

/**
 * Shoulder probe: the icon's upper-left body, clear of the weapon
 * silhouette (drawn center/lower), the cast gauge digits (hanging top-right)
 * and the POV sub/special trinkets (bottom). The special-ready glow is
 * detected here. Boxes are relative to a slot center.
 */
export const STATUS_SHOULDER_BOX_POV = { dx: -30, y: 38, w: 24, h: 20 };
export const STATUS_SHOULDER_BOX_CAST = { dx: -30, y: 35, w: 24, h: 30 };

/**
 * Body probe: the widest band of the icon that dodges the cast camera
 * badges below (y>=100) and the POV coin trinkets (y>=95). Team ink
 * presence here separates alive icons from the grey/dark splatted ones.
 * Sized to cover most of the icon: a slimmer box left alive icons whose
 * body is largely weapon silhouette/badges reading ink 0.24 while stage
 * ink bleeding around a translucent dead icon read 0.23 (AREA CUP VoD) —
 * this footprint separates them at 0.26 vs 0.20.
 */
export const STATUS_BODY_BOX_POV = { dx: -40, y: 40, w: 80, h: 50 };
export const STATUS_BODY_BOX_CAST = { dx: -40, y: 45, w: 80, h: 50 };

/**
 * An ink pixel: saturated and bright enough to be team color. The value
 * floor keeps dark saturated stage backdrops (deep blue arena walls behind
 * the translucent dead icons measure v<=90) from counting as ink.
 */
export const STATUS_INK_MIN_SPREAD = 70;
export const STATUS_INK_MIN_VALUE = 105;

/**
 * A glow pixel of the special-ready wash. 225 splits the attested ready
 * shoulders (fractions >=0.40) from the brightest alive team color — POV
 * lime peaks between 215 and 225 (glow fraction 0.97 at 215, 0.00 at 225).
 */
export const STATUS_GLOW_MIN_VALUE = 225;

/**
 * A pale pixel: bright but unsaturated, the ready wash across its whole
 * pulse cycle. The wash PULSES — its trough dims below the glow floor
 * (~190-220) while staying pale, so a trough frame reads no ink and no
 * glow; without the pale class it is indistinguishable from a splat.
 */
export const STATUS_PALE_MIN_VALUE = 185;
export const STATUS_PALE_MAX_SPREAD = 70;

/**
 * Splatted: body ink under the floor (attested dead <=0.20 vs alive
 * >=0.26 with the current body box) with two guards: shoulder glow keeps
 * the bright ready wash out (glow >=0.40 vs dead <=0.03), body pale keeps
 * the wash's dim pulse trough out (pale >=0.27 vs dead <=0.07).
 */
export const STATUS_DEAD_MAX_BODY_INK = 0.23;
export const STATUS_DEAD_MAX_SHOULDER_GLOW = 0.2;
export const STATUS_DEAD_MAX_BODY_PALE = 0.15;

/** Special ready: shoulder glow past this (attested >=0.40 vs <=0.06). */
export const STATUS_READY_MIN_SHOULDER_GLOW = 0.25;

/**
 * Special ready off the body when the shoulder misses the wash (pulse
 * trough, or wash dimmed on compressed footage): pale-dominant body
 * (attested ready >=0.40 vs alive <=0.25 — plain alive bodies show some
 * pale from weapon-silhouette whites).
 */
export const STATUS_READY_MIN_BODY_PALE = 0.32;

/**
 * Cast-layout ready guard: the cast wash REPLACES the body's team ink
 * (attested washed bodies <=0.36 — the top end is stage ink bleeding
 * around the washed icon), so an ink-heavy body proves a bright
 * shoulder/pale read is backdrop leaking past the icon edge — the
 * spectator overhead view draws a badge-less strip whose left column sits
 * ~12px off the cast centers, sliding the probes onto pale buildings and
 * the team-color lead banner (attested leaks read body ink >=0.44). POV
 * ready icons instead light up IN team color (attested ink up to 0.68),
 * so the guard is cast-only.
 */
export const STATUS_READY_WASH_MAX_BODY_INK = 0.4;

/**
 * Layout scoring (see player-status.ts): per-slot decisiveness is the
 * body-ink distance from the dead threshold, capped so one saturated slot
 * cannot carry a misaligned geometry. The sticky margin is what the
 * non-established layout must win the score by before a badge-less frame
 * switches an established geometry.
 */
export const STATUS_LAYOUT_SCORE_CAP = 0.3;
export const STATUS_LAYOUT_STICKY_MARGIN = 0.04;

/**
 * An established layout only carries forward across reads this close in
 * time — in-match reads land ~1s apart, while a longer silence means a new
 * match (possibly new footage type) and the next frame picks fresh.
 */
export const STATUS_LAYOUT_STICKY_MAX_GAP_S = 30;

/**
 * Cast-layout discriminator: the spectator HUD always draws white camera
 * badges under the right team's icons; nothing fixed sits there on POV
 * footage. All four probes must read white (bright AND unsaturated —
 * bright sky is saturated cyan) to call the frame cast. The mirror set
 * covers the cast-mirror arrangement's wide right badge pitch.
 */
export const STATUS_DPAD_PROBES: readonly Roi[] = [1105, 1180, 1256, 1332].map(
	(cx) => ({ x: cx - 8, y: 102, w: 16, h: 16 }),
);
export const STATUS_DPAD_PROBES_MIRROR: readonly Roi[] = [
	1110, 1207, 1303, 1401,
].map((cx) => ({ x: cx - 8, y: 102, w: 16, h: 16 }));
export const STATUS_WHITE_MIN_VALUE = 215;
export const STATUS_WHITE_MAX_SPREAD = 40;
export const STATUS_CAST_MIN_DPAD_WHITE = 0.35;
