/**
 * Objective-counter ROIs in canonical 1920x1080 space, calibrated against the
 * objective/ fixtures. Layout is only roughly mirror-symmetric around x=960
 * ("100" spans x816..888 left, x1039..1112 right), so score/plate ROIs are
 * measured per side. Each plate: localized label over BlitzBold count digits
 * (~41px); the controlling plate fills team-color, otherwise near-black with
 * team-ink digits. A penalty adds a dark pill with white "+N" (~29px).
 */
import { CANONICAL_WIDTH, type Roi } from "../../canonical";

/** Mirror a left-side ROI across the frame's vertical center line. */
function mirrorRoi(roi: Roi): Roi {
	return { ...roi, x: CANONICAL_WIDTH - roi.x - roi.w };
}

/** Count digit band, wide enough for "100" and clear of the plate rims (edge glow reads as ink). */
export const SCORE_ROIS: readonly [Roi, Roi] = [
	{ x: 810, y: 156, w: 90, h: 46 },
	{ x: 1034, y: 156, w: 84, h: 46 },
];

/** Penalty "+N" band inside the pill (x 826..920, y 218..256 left), rounded ends left out. */
export const PENALTY_ROIS: readonly [Roi, Roi] = (() => {
	const left: Roi = { x: 832, y: 220, w: 82, h: 36 };
	return [left, mirrorRoi(left)];
})();

/**
 * Plate-fill probes inside each plate's LEFT rim, clear of the widest digit run
 * (not mirrored: the right run reaches x1112). Both styles are a flat fill there,
 * so the gate accepts flatness (std) alone since brightness spans black to yellow.
 */
export const PLATE_PROBE_ROIS: readonly [Roi, Roi] = [
	{ x: 800, y: 162, w: 10, h: 30 },
	{ x: 1021, y: 162, w: 10, h: 30 },
];

/** Pill presence probes at the rounded ends, clear of "+100": translucent fill reads mid-dark and flat. */
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
 * Gate anchor: the timer's white M:SS in a near-black box. In-match HUD reads
 * <=32 on each dark probe; closest lookalike is the replay-browser header's
 * stage tag ("Banlieue Balibot" ~48). Turf War and the death cam also show a
 * timer; the plate probes and no-readable-count rejection handle those.
 */
export const TIMER_DIGIT_ROI: Roi = { x: 908, y: 54, w: 100, h: 40 };
export const TIMER_DARK_PROBES: readonly Roi[] = [
	{ x: 915, y: 45, w: 80, h: 7 },
	{ x: 897, y: 57, w: 8, h: 26 },
	{ x: 1012, y: 57, w: 7, h: 26 },
];
export const GATE_TIMER_MAX_MEAN = 40;
export const GATE_TIMER_MIN_MAX_BRIGHTNESS = 240;

/**
 * Timer digits are 34px on native 1080p, ~40px on upscaled 720p; both tried,
 * best valid read wins. The colon's dots fall under the height floor at either size.
 */
export const TIMER_TEXT_HEIGHTS = [34, 40] as const;
export const TIMER_BIN_THRESHOLD = 160;
export const TIMER_DIGIT_MIN_CONF = 0.75;
export const TIMER_DIGIT_MIN_HEIGHT_RATIO = 0.82;

/** Count digits measure ~40-44px across attested plates; best trailing read wins. */
export const SCORE_TEXT_HEIGHTS = [40, 44] as const;
export const PENALTY_TEXT_HEIGHT = 29;

/** Thresholds per plate style (team ink ~200+ on ~45 black; white ~250 on fills up to ~130). */
export const SCORE_BIN_THRESHOLDS = [160, 190] as const;

/**
 * Extension floor for digits joining a confidently anchored run: compressed
 * cast footage erodes a leading white digit on a bright fill to 0.64-0.76 ("50"
 * read as "0", Splat World Series lime plates); noise reached 0.66 but never
 * alongside an anchor digit.
 */
export const SCORE_EXTEND_MIN_CONF = 0.6;

/** Penalty pill: white digits on the translucent dark fill (~100 gray). */
export const PENALTY_BIN_THRESHOLD = 170;
export const PENALTY_PROBE_MAX_MEAN = 165;
export const PENALTY_PROBE_MAX_STD = 30;

/** Control = saturated plate fill: even deep blue keeps ~130 spread; attested fills >=112 vs <=19. */
export const CONTROL_PLATE_MIN_SATURATION = 60;

// Player-status icon strips: eight squid/octo icons flank the timer (alive =
// team-ink body, special held = pale wash, splatted = grey X). Three geometries
// named by which side sits at the packed pitch: "even" draws small icons at
// ~99px on both sides; the spectator HUD draws bigger icons (gauge digits
// top-RIGHT, camera badges below) at per-side pitches (~98 left vs ~76 right =
// "narrow-right"). Nothing is mirror-symmetric (even inner icons sit 108px left
// / 130px right of center), so centers are measured per side. Spectator icons
// ride ~20px left of their badge centers; the outer-right center sits past the
// measured icon (~1313) because splat X's lean into inked backdrop on the left
// while alive bodies extend right (dead <=0.16 vs alive >=0.33 at 1320).
//
// The spectator strip MIRRORS its pitches when the broadcast specs the other
// team (AREA CUP VoD): "narrow-left", badges and all. Its right column lands
// within px of even's, so it must be its own scored, badge-probed candidate or
// the left column misreads. S3 POV draws both badge-less narrow arrangements
// in steady state (2026-08-22 Sendou VoD = narrow-left, 2026-08-11 =
// narrow-right), so no geometry implies a footage type; only badges prove a
// broadcast (`cast`). Broadcasts can also hide badges while keeping geometry
// (AREA CUP VoD), so player-status.ts scores the geometries by body-read
// decisiveness; a mispicked layout flickers phantom deaths on the outer players.

/** Per-side slot center x's, slots left-to-right. */
export const STATUS_SLOT_CENTERS_EVEN: readonly [
	readonly number[],
	readonly number[],
] = [
	[554, 653, 752, 852],
	[1090, 1190, 1288, 1388],
];
export const STATUS_SLOT_CENTERS_NARROW_RIGHT: readonly [
	readonly number[],
	readonly number[],
] = [
	[543, 642, 741, 837],
	[1085, 1161, 1237, 1320],
];
export const STATUS_SLOT_CENTERS_NARROW_LEFT: readonly [
	readonly number[],
	readonly number[],
] = [
	[605, 681, 757, 833],
	[1090, 1187, 1283, 1381],
];

/**
 * Shoulder probe (special-ready glow): upper-left body, clear of the weapon
 * silhouette, spectator gauge digits (top-right) and even trinkets (bottom).
 * Relative to a slot center.
 */
export const STATUS_SHOULDER_BOX_EVEN = { dx: -30, y: 38, w: 24, h: 20 };
export const STATUS_SHOULDER_BOX_NARROW = { dx: -30, y: 35, w: 24, h: 30 };

/**
 * Body probe (team ink = alive): widest band dodging camera badges (y>=100) and
 * even coin trinkets (y>=95). A slimmer box read alive 0.24 vs dead bleed 0.23
 * (AREA CUP VoD); this footprint separates them at 0.26 vs 0.20.
 */
export const STATUS_BODY_BOX_EVEN = { dx: -40, y: 40, w: 80, h: 50 };
export const STATUS_BODY_BOX_NARROW = { dx: -40, y: 45, w: 80, h: 50 };

/** Ink pixel: saturated and bright; the value floor excludes dark saturated backdrops (blue walls v<=90). */
export const STATUS_INK_MIN_SPREAD = 70;
export const STATUS_INK_MIN_VALUE = 105;

/**
 * Glow pixel: 225 splits ready shoulders (>=0.40) from the brightest alive ink (even lime: 0.97 at
 * 215, 0.00 at 225).
 */
export const STATUS_GLOW_MIN_VALUE = 225;

/**
 * Narrow-layout glow must be UNSATURATED: the wash is pale while backdrop leak
 * is colored (sky over a dead shoulder: 0.30 raw, 0.00 capped, spread >130;
 * lilac/pink washes spread 70-90, capped 0.46-0.61). Even ready icons light IN
 * team color (glow 0.94 saturated), so narrow layouts only.
 */
export const STATUS_GLOW_MAX_SPREAD = 90;

/**
 * Pale pixel: bright but unsaturated. The wash PULSES, dimming below the glow
 * floor (~190-220) at its trough; without this class a trough frame reads as a splat.
 */
export const STATUS_PALE_MIN_VALUE = 185;
export const STATUS_PALE_MAX_SPREAD = 70;

/**
 * Splatted: body ink under the floor (dead <=0.20 vs alive >=0.26) and the
 * body-pale guard keeping the wash out across its pulse (wash >=0.22 vs dead
 * <=0.15 under the 2026-08-22 VoD's skylight). Even reads add the shoulder-glow
 * guard (ready >=0.40 vs dead <=0.03); on narrow layouts backdrop leak past a
 * shrunken X reads 0.26-0.35 there, so only the body classes decide.
 */
export const STATUS_DEAD_MAX_BODY_INK = 0.23;
export const STATUS_DEAD_MAX_SHOULDER_GLOW = 0.2;
export const STATUS_DEAD_MAX_BODY_PALE = 0.15;

/** Special ready: shoulder glow past this (attested >=0.40 vs <=0.06). */
export const STATUS_READY_MIN_SHOULDER_GLOW = 0.25;

/**
 * Ready off the body when the shoulder misses the wash (trough, compressed
 * footage): ready >=0.31 (AREA CUP after a respawn) vs alive <=0.25 (silhouette whites).
 */
export const STATUS_READY_MIN_BODY_PALE = 0.3;

/**
 * Narrow-layout ready guard: the wash REPLACES body ink, so an ink-heavy body
 * means backdrop leak (the overhead view's left column sits ~12px off, sliding
 * probes onto pale buildings / the lead banner: ink >=0.44). Graded: clean
 * washes ink <=0.28; inky washes (0.316/0.344) still read strongly pale
 * (>=0.399) while the Um'ami POV leak read ink 0.36 / pale 0.269. Even ready
 * icons light IN team color (ink up to 0.68), so narrow only. Margins are THIN
 * (ink 0.344 vs 0.4; pale 0.399 vs 0.35) — re-measure before moving any.
 */
export const STATUS_READY_WASH_MAX_BODY_INK = 0.4;
export const STATUS_READY_CLEAN_WASH_MAX_BODY_INK = 0.3;
export const STATUS_READY_INKY_WASH_MIN_BODY_PALE = 0.35;

/**
 * Narrow ready reads also need a minimally pale body: every attested wash reads
 * >=0.22 (bright and trough) while a dead icon under skylight leak (2026-08-22
 * VoD: shoulder 0.26-0.35) reads pale <=0.15 — a dead body is ink-poor, so the
 * ink guards cannot catch it. Even reads skip this.
 */
export const STATUS_READY_MIN_WASH_BODY_PALE = 0.2;

/**
 * Layout scoring: per-slot decisiveness is body-ink distance from the dead
 * threshold, capped so one saturated slot cannot carry a misaligned geometry.
 * Sticky margin: what a challenger must win by to switch an established layout.
 */
export const STATUS_LAYOUT_SCORE_CAP = 0.3;
export const STATUS_LAYOUT_STICKY_MARGIN = 0.04;

/**
 * Fresh badge-less picks prefer narrow-right (badge-less even is barely
 * attested; busy backdrops mis-rank: sendou-triton match-start scores even
 * 0.278 / narrow-right 0.273 yet is narrow-right). Even wins only when
 * narrow-right reads under the floor (S2 POV fixture 0.198 vs true >=0.212) or
 * leads decisively (true narrow-right mis-leads even by at most 0.036).
 */
export const STATUS_FRESH_NARROW_RIGHT_MIN_DECISIVENESS = 0.21;
export const STATUS_FRESH_EVEN_MIN_LEAD = 0.05;

/**
 * Fresh badge-less NARROW-LEFT pick (pickLayout): S3 POV draws it in steady
 * state (2026-08-22 Sendou VoD, centers within ~10px) over pale backdrops that
 * drown the comb, so the LEFT column — the only one differing from even — must
 * win decisively: true frames lead by >=0.046, rival winners by <=0.001. The S2
 * POV fixture survives that (lead 0.052 off featureless backdrop) but its left
 * comb is strong at the rival pitch (0.326/0.325 vs <=0.220 on true frames), so
 * a readable rival left comb vetoes.
 */
export const STATUS_FRESH_NARROW_LEFT_MIN_LEFT_LEAD = 0.025;
export const STATUS_FRESH_NARROW_LEFT_RIVAL_COMB_VETO = 0.3;

/**
 * Slot-comb contrast (combContrast): a rigid comb exposes the pitch — badge-less
 * narrow-left scores 0.81 while narrow-right reads it at -0.07 (sendou-triton
 * MakoMart), so a decisive win proves narrow-left despite the shared right
 * column. Both gates needed: worst false narrow-left comb is 0.44 with a 0.24 lead.
 */
export const STATUS_COMB_BAND_Y = 35;
export const STATUS_COMB_BAND_H = 61;
export const STATUS_COMB_SIDE_SPANS: readonly [
	[number, number],
	[number, number],
] = [
	[440, 960],
	[960, 1480],
];
export const STATUS_COMB_CENTER_HALF_WIDTH = 16;
export const STATUS_COMB_GAP_HALF_WIDTH = 7;
export const STATUS_COMB_MAX_SHIFT = 10;
export const STATUS_NARROW_LEFT_COMB_MIN = 0.5;
export const STATUS_NARROW_LEFT_COMB_LEAD = 0.25;

/**
 * Sticky flips away from narrow-right need comb corroboration (past this floor
 * AND leading by STATUS_NARROW_LEFT_COMB_LEAD): while the S3 POV player is dead
 * the strip shrinks ~0.77 toward the timer, landing near narrow-left pitches
 * (2026-08-11 Um'ami VoD locked 107 of 136 reads that way). True narrow-left
 * combs 0.41-0.81 with >=0.31 lead; worst POV false comb 0.20, negative lead.
 */
export const STATUS_STICKY_FLIP_COMB_MIN = 0.3;

/** Layout carries forward only across reads this close (~1s apart in-match); longer means a new match. */
export const STATUS_LAYOUT_STICKY_MAX_GAP_S = 30;

// Strip weapon-icon evidence (strip-weapons.ts), calibrated on the sendou-triton
// VoD (narrow-right, 720p upscaled to canonical).

/**
 * Search window per slot center: holds the render at any geometry (~65px on narrow strips) without
 * a neighbor's art.
 */
export const STRIP_WEAPON_BOX = { dx: -50, y: 20, w: 100, h: 100 };

/** Narrow strips draw renders at ~55-70px depending on the weapon's aspect. */
export const STRIP_WEAPON_TEMPLATE_SIZES = [44, 52, 60, 68, 76] as const;

/**
 * Knocked-out plate pixels and template backgrounds: mid-grey so dark barrels and white bodies both
 * keep contrast.
 */
export const STRIP_WEAPON_TEMPLATE_BACKGROUND = 90;

/** Ink floor for the NCC coverage penalty over that background. */
export const STRIP_WEAPON_INK_THRESHOLD = 140;

/**
 * Plate pixel: saturated, bright, near the region's modal saturated hue. Floors
 * sit under the modal-vote floors (+15 in strip-weapons.ts) to reach dimmer edge pixels.
 */
export const STRIP_WEAPON_KNOCKOUT_MIN_SPREAD = 55;
export const STRIP_WEAPON_KNOCKOUT_MIN_VALUE = 90;
export const STRIP_WEAPON_MAX_PLATE_HUE_DIST = 30;

/** Single reads rank the true weapon top-1 about half the time, but top-8 often enough for the aggregate. */
export const STRIP_WEAPON_TOP_K = 8;

/**
 * Every Nth counter read samples strip weapons: ~20 samples over a short match assign correctly;
 * the sweep is too heavy per read.
 */
export const STRIP_WEAPON_SAMPLE_INTERVAL = 5;

/**
 * Broadcast discriminator (`cast`): the spectator HUD draws white camera badges
 * under the right team's icons. All four probes must read white (bright AND
 * unsaturated — sky is saturated cyan). Badge frames read >=0.33 (AREA CUP faded
 * row), every badge-less frame <=0.004.
 */
export const STATUS_DPAD_PROBES_NARROW_RIGHT: readonly Roi[] = [
	1105, 1180, 1256, 1332,
].map((cx) => ({ x: cx - 8, y: 102, w: 16, h: 16 }));
export const STATUS_DPAD_PROBES_NARROW_LEFT: readonly Roi[] = [
	1110, 1207, 1303, 1401,
].map((cx) => ({ x: cx - 8, y: 102, w: 16, h: 16 }));
export const STATUS_WHITE_MIN_VALUE = 215;
export const STATUS_WHITE_MAX_SPREAD = 40;
export const STATUS_CAST_MIN_DPAD_WHITE = 0.25;
