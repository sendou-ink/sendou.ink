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
 * near-black box only the in-match HUD draws. In-match HUD reads <=32 on
 * each dark probe; other screens light one past this ceiling — the closest
 * lookalike is the replay-browser header, whose black stage tag reaches
 * under the side probes when the stage name is long ("Banlieue Balibot"
 * reads ~48 there). Turf War and the death cam (one centered pill) also
 * show a timer — there the plate probes and no-readable-count parse
 * confirmation carry the rejection.
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
// X'd shape. Three geometries share the band, named by which side sits at
// the packed pitch. "even" draws small icons at a ~99px pitch on both
// sides; the casted spectator HUD draws bigger icons (gauge digits hanging
// over each icon's top-RIGHT and white camera-button badges below) at
// per-side pitches — slot centers are measured per side off the fixtures;
// no geometry is mirror-symmetric (even inner icons sit 108px left /
// 130px right of screen center) and the spectator sides don't share a
// pitch (~98 left vs ~76 right = "narrow-right"). Spectator icons ride
// their badge columns ~20px left of each badge center; the outer-right
// center sits a few px past the measured icon (~1313) because splat X's
// there lean into inked backdrop on their left while alive bodies extend
// right (attested dead <=0.16 vs alive >=0.33 at 1320).
//
// The spectator strip additionally MIRRORS its pitches when the broadcast
// specs a player on the other team (attested mid-game in the AREA CUP
// VoD): the narrow ~76 pitch swaps to the left column and the wide ~97
// pitch to the right, badges and all — the "narrow-left" layout. Its
// right column lands within a few px of the even right column, so a
// mirrored frame scores deceptively well as even; narrow-left's own
// geometry must be a scored candidate (and badge-probed) or the left
// column misreads ready/dead. S3 POV footage draws the badge-less narrow
// arrangements in steady state too (the whole 2026-08-22 Sendou POV VoD
// measures narrow-left, both alive and death-cam frames — vs the
// 2026-08-11 POV VoD's narrow-right), so narrow-left is also a fresh
// badge-less pick (STATUS_FRESH_NARROW_LEFT_*) — and no geometry implies
// a footage type; only the badges prove a broadcast (PlayerStatusData's
// `cast`).
//
// Broadcasts can hide the camera badges while keeping their icon geometry
// (attested in the AREA CUP VoD), so badge absence alone cannot pick the
// even layout — player-status.ts scores the geometries and keeps the one
// whose body reads sit decisively on either side of the dead threshold; a
// mispicked layout puts outer-slot boxes between icons and flickers
// phantom deaths on the outermost players.

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
 * Shoulder probe: the icon's upper-left body, clear of the weapon
 * silhouette (drawn center/lower), the spectator gauge digits (hanging
 * top-right) and the even layout's sub/special trinkets (bottom). The
 * special-ready glow is
 * detected here. Boxes are relative to a slot center.
 */
export const STATUS_SHOULDER_BOX_EVEN = { dx: -30, y: 38, w: 24, h: 20 };
export const STATUS_SHOULDER_BOX_NARROW = { dx: -30, y: 35, w: 24, h: 30 };

/**
 * Body probe: the widest band of the icon that dodges the spectator camera
 * badges below (y>=100) and the even layout's coin trinkets (y>=95). Team ink
 * presence here separates alive icons from the grey/dark splatted ones.
 * Sized to cover most of the icon: a slimmer box left alive icons whose
 * body is largely weapon silhouette/badges reading ink 0.24 while stage
 * ink bleeding around a translucent dead icon read 0.23 (AREA CUP VoD) —
 * this footprint separates them at 0.26 vs 0.20.
 */
export const STATUS_BODY_BOX_EVEN = { dx: -40, y: 40, w: 80, h: 50 };
export const STATUS_BODY_BOX_NARROW = { dx: -40, y: 45, w: 80, h: 50 };

/**
 * An ink pixel: saturated and bright enough to be team color. The value
 * floor keeps dark saturated stage backdrops (deep blue arena walls behind
 * the translucent dead icons measure v<=90) from counting as ink.
 */
export const STATUS_INK_MIN_SPREAD = 70;
export const STATUS_INK_MIN_VALUE = 105;

/**
 * A glow pixel of the special-ready wash. 225 splits the attested ready
 * shoulders (fractions >=0.40) from the brightest alive team color —
 * even-layout lime peaks between 215 and 225 (glow fraction 0.97 at 215,
 * 0.00 at 225).
 */
export const STATUS_GLOW_MIN_VALUE = 225;

/**
 * Narrow-layout glow must also be UNSATURATED: the spectator wash is pale
 * even at its brightest, while backdrop leaking past an icon edge is
 * colored — bright sky over a dead icon's shoulder reads glow 0.30 raw but
 * 0.00 under this cap (sky spread >130), and the lilac/pink washes sit at
 * spread 70-90 (attested capped fractions 0.46-0.61 vs raw 0.46-0.62).
 * Even-layout ready icons light up IN team color (attested glow 0.94 fully
 * saturated), so the cap applies to the narrow layouts only, like the
 * wash-ink guard.
 */
export const STATUS_GLOW_MAX_SPREAD = 90;

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
 * >=0.26 with the current body box) with the body-pale guard keeping the
 * wash out across its whole pulse cycle (wash pale >=0.22 vs dead <=0.15 —
 * the 0.15 is a dead icon under the 2026-08-22 VoD's skylight backdrop).
 * Even-layout reads add the shoulder-glow guard against the bright
 * team-color ready flash (glow >=0.40 vs dead <=0.03); on the narrow
 * layouts the same probe reads backdrop leaking past a shrunken X's shoulder at 0.26-0.35,
 * over any usable ceiling, so there only the body classes decide.
 */
export const STATUS_DEAD_MAX_BODY_INK = 0.23;
export const STATUS_DEAD_MAX_SHOULDER_GLOW = 0.2;
export const STATUS_DEAD_MAX_BODY_PALE = 0.15;

/** Special ready: shoulder glow past this (attested >=0.40 vs <=0.06). */
export const STATUS_READY_MIN_SHOULDER_GLOW = 0.25;

/**
 * Special ready off the body when the shoulder misses the wash (pulse
 * trough, or wash dimmed on compressed footage): pale-dominant body
 * (attested ready >=0.31 — the AREA CUP narrow-left wash after a respawn — vs
 * alive <=0.25 — plain alive bodies show some pale from weapon-silhouette
 * whites).
 */
export const STATUS_READY_MIN_BODY_PALE = 0.3;

/**
 * Narrow-layout ready guard: the spectator wash REPLACES the body's team
 * ink, so an ink-heavy body proves a bright shoulder/pale read is backdrop
 * leaking past the icon edge — the spectator overhead view draws a
 * badge-less strip whose left column sits ~12px off the narrow-right
 * centers, sliding the probes onto pale buildings and the team-color lead
 * banner (attested leaks read body ink >=0.44). The guard is graded: clean
 * washes read ink <=0.28, and the attested inky washes (stage ink bleeding
 * around the washed icon, 0.316/0.344) still show a strongly pale body
 * (>=0.399) — while the S3 POV Um'ami backdrop leak that faked a star read
 * ink 0.36 with pale only 0.269, so the mid band demands the pale
 * corroboration. Even-layout ready icons instead light up IN team color
 * (attested ink up to 0.68), so the guard applies to the narrow layouts
 * only. Margins are THIN (true ink 0.344 vs
 * hard ceiling 0.4; true pale 0.399 vs floor 0.35) — re-measure before
 * moving any of the three.
 */
export const STATUS_READY_WASH_MAX_BODY_INK = 0.4;
export const STATUS_READY_CLEAN_WASH_MAX_BODY_INK = 0.3;
export const STATUS_READY_INKY_WASH_MIN_BODY_PALE = 0.35;

/**
 * Narrow-layout ready reads also need a minimally pale body: the wash
 * surface always paints the body probe pale (every attested spectator wash
 * reads >=0.22, bright phase and trough alike), while a splatted icon
 * with a bright backdrop leaking over its shoulder shows none (leaks on
 * the 2026-08-22 POV VoD's skylight/glass backdrops lit the shoulder
 * 0.26-0.35 past the ready floor over grey X bodies reading pale <=0.15).
 * The washed-ink guards cannot catch this — a dead body is ink-poor by
 * nature. Even-layout ready icons light in team color, so even reads
 * skip it.
 */
export const STATUS_READY_MIN_WASH_BODY_PALE = 0.2;

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
 * History-less badge-less picks prefer narrow-right: every attested
 * badge-less strip draws a narrow geometry (an even strip on badge-less
 * footage is barely attested), and decisiveness alone mis-ranks busy
 * backdrops — the sendou-triton match-start frame scores even 0.278 /
 * narrow-right 0.273 yet is narrow-right. Even wins a fresh pick only
 * when the narrow-right geometry reads poorly (below the floor — the S2
 * POV fixture reads narrow-right at 0.198 vs attested narrow-right
 * footage >=0.212) or even beats it by a decisive lead (attested
 * narrow-right frames mis-lead even by at most 0.036).
 */
export const STATUS_FRESH_NARROW_RIGHT_MIN_DECISIVENESS = 0.21;
export const STATUS_FRESH_EVEN_MIN_LEAD = 0.05;

/**
 * Fresh badge-less NARROW-LEFT pick (see pickLayout): S3 POV footage can
 * draw the badge-less narrow-left arrangement in steady state (attested
 * across the 2026-08-22 Sendou POV VoD — icon centers measured on the
 * narrow-left pitches within ~10px), and its pale backdrops drown the
 * slot comb (gaps read as iconness), so the comb-decisive gate cannot
 * claim these frames. Instead a fresh narrow-left pick needs the LEFT
 * column — the only column where narrow-left and its even false friend
 * differ — to win decisively: attested true narrow-left frames lead the
 * rival left decisiveness by >=0.046 while every attested
 * narrow-right/even frame that also wins the overall score leads by
 * <=0.001. One false friend survives that cut (the S2 POV fixture, left
 * lead 0.052 from boxes landing on featureless backdrop) but its left
 * comb is strong at the rival pitch (even 0.326 / narrow-right 0.325 vs
 * <=0.220 on every attested narrow-left frame), so a readable rival left
 * comb vetoes.
 */
export const STATUS_FRESH_NARROW_LEFT_MIN_LEFT_LEAD = 0.025;
export const STATUS_FRESH_NARROW_LEFT_RIVAL_COMB_VETO = 0.3;

/**
 * Slot-comb contrast (see combContrast in player-status.ts): mean iconness
 * at a layout's slot centers minus mean at its between-slot gaps, maximized
 * over a small global shift. Rigid comb positions expose the arrangement's
 * pitch — the badge-less narrow-left strip scores 0.81 while narrow-right
 * reads it at -0.07 (sendou-triton MakoMart) — so a decisive comb win
 * proves the narrow-left arrangement even though its right column nearly
 * coincides with even's. Both gates are needed: the worst attested false
 * narrow-left comb is 0.44 total (lead-banner frame) with a 0.24 lead.
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
 * Sticky flips away from an established narrow-right layout also need
 * comb corroboration (challenger comb past this floor AND leading
 * narrow-right's comb by STATUS_NARROW_LEFT_COMB_LEAD): S3 POV footage
 * draws that geometry, but while the POV player is dead the whole strip
 * shrinks toward the timer (~0.77 scale, left column landing near the
 * narrow-left pitches), and those transient frames spike the narrow-left
 * decisiveness past the sticky margin — the 2026-08-11 Um'ami POV VoD
 * locked 107 of 136 reads into narrow-left that way. Attested true
 * narrow-left stretches comb 0.41-0.81 with >=0.31 lead over
 * narrow-right; the worst POV-footage narrow-left comb is 0.20 with a
 * negative lead.
 */
export const STATUS_STICKY_FLIP_COMB_MIN = 0.3;

/**
 * An established layout only carries forward across reads this close in
 * time — in-match reads land ~1s apart, while a longer silence means a new
 * match (possibly new footage type) and the next frame picks fresh.
 */
export const STATUS_LAYOUT_STICKY_MAX_GAP_S = 30;

// ---- strip weapon-icon evidence (the StripWeapons event) ----
//
// Each slot draws the player's weapon render over its squid plate; the
// match builder aggregates sampled per-slot candidate rankings across a
// match to solve the strip-slot → scoreboard-row assignment
// (strip-weapons.ts). Calibrated on the sendou-triton VoD (narrow-right
// geometry on 720p footage upscaled to canonical space).

/**
 * Weapon search window relative to a slot center: generous enough to hold
 * the render at any strip geometry (the render measures ~65px on the
 * narrow strips, smaller on even) without swallowing a neighbor slot's art.
 */
export const STRIP_WEAPON_BOX = { dx: -50, y: 20, w: 100, h: 100 };

/**
 * Template render heights to try inside the window; the attested narrow
 * strips draw renders at ~55-70px depending on the weapon's aspect.
 */
export const STRIP_WEAPON_TEMPLATE_SIZES = [44, 52, 60, 68, 76] as const;

/**
 * The flat grey the knocked-out plate pixels become and templates are
 * composited over — mid-grey, so both dark barrels and white bodies keep
 * contrast against it.
 */
export const STRIP_WEAPON_TEMPLATE_BACKGROUND = 90;

/** Ink floor for the NCC coverage penalty over that background. */
export const STRIP_WEAPON_INK_THRESHOLD = 140;

/**
 * A plate pixel: saturated and bright (the plate is drawn in team ink),
 * within the hue band of the region's modal saturated hue. The spread and
 * value floors sit under the modal-vote floors (+15 in strip-weapons.ts)
 * so the knockout reaches the plate's dimmer edge pixels the vote skips.
 */
export const STRIP_WEAPON_KNOCKOUT_MIN_SPREAD = 55;
export const STRIP_WEAPON_KNOCKOUT_MIN_VALUE = 90;
export const STRIP_WEAPON_MAX_PLATE_HUE_DIST = 30;

/**
 * Candidates kept per slot: single reads only rank the true weapon top-1
 * about half the time on attested footage, but it lands in the top 8 in
 * enough reads for the cross-match aggregate to decide.
 */
export const STRIP_WEAPON_TOP_K = 8;

/**
 * Every Nth successful counter read samples the strip weapons: identities
 * are fixed per match, ~1 read/s makes ~20 samples over a short match —
 * attested to assign correctly — and the full-atlas NCC sweep is too
 * heavy to run on every read.
 */
export const STRIP_WEAPON_SAMPLE_INTERVAL = 5;

/**
 * Broadcast discriminator (PlayerStatusData's `cast`): the spectator HUD
 * always draws white camera badges under the right team's icons; nothing
 * fixed sits there on POV footage. All four probes must read white
 * (bright AND unsaturated — bright sky is saturated cyan) to call the
 * frame cast. The narrow-left set covers that arrangement's wide right
 * badge pitch. The white floor sits in a wide attested gap: badge-bearing
 * frames read a min-probe fraction >=0.33 (the AREA CUP gauge-overlay
 * wash frame's slightly faded badge row) while every badge-less frame —
 * POV footage and badge-hidden broadcast stretches alike — reads <=0.004.
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
