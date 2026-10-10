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
 * timer; the plate probes and no-readable-count rejection handle those. The
 * last minute's digits are yellow, which peaks at 220-249 in gray against
 * white's 255.
 */
export const TIMER_DIGIT_ROI: Roi = { x: 908, y: 54, w: 100, h: 40 };
export const TIMER_DARK_PROBES: readonly Roi[] = [
	{ x: 915, y: 45, w: 80, h: 7 },
	{ x: 897, y: 57, w: 8, h: 26 },
	{ x: 1012, y: 57, w: 7, h: 26 },
];
export const GATE_TIMER_MAX_MEAN = 40;
export const GATE_TIMER_MIN_MAX_BRIGHTNESS = 200;

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

/**
 * A spectated player's in-world nameplate badge can cover one rounded end (SWS26
 * cast), so a single pill-like probe still reads the digits but they must carry
 * the read alone: attested pills >=0.91, probe-less lookalikes <=0.35.
 */
export const PENALTY_SINGLE_PROBE_MIN_CONF = 0.8;

/** Control = saturated plate fill: even deep blue keeps ~130 spread; attested fills >=112 vs <=19. */
export const CONTROL_PLATE_MIN_SATURATION = 60;

// Player-status icon strips (player-status.ts): four squid/octo icons per side
// flank the timer, alive = team ink, special ready = a pale wash that pulses,
// splatted = dark plate under a grey X, vacant seat = an opaque black squid. The game resizes each side
// continuously (S3 POV swings it with the objective, a splatted POV player
// shrinks it, spectators toggle views, broadcasts mirror it), so each side's
// pitch is fitted per read. Icons scale with their pitch about a fixed center
// line, the inner icon pinned beside the timer.

/** Each side's icon strip at any fitted pitch, for the debug views' crops. */
export const STATUS_STRIP_ROIS: readonly [Roi, Roi] = [
	{ x: 470, y: 10, w: 420, h: 115 },
	{ x: 1030, y: 10, w: 425, h: 115 },
];

/** Band every fitted pitch's apexes, gaps, team-hue sample and body probe fall within. */
export const STATUS_BAND: Roi = { x: 440, y: 10, w: 1040, h: 92 };

/**
 * Fitted pitches span every attested geometry and the tweens between (S3
 * draws in-between pitches for seconds, e.g. ~81 beside ~91). The inner icon
 * holds within a few px of these centers at every pitch.
 */
export const STATUS_PITCH_RANGE: readonly [number, number] = [72, 102];
export const STATUS_INNER_CENTER_RANGES: readonly [
	readonly [number, number],
	readonly [number, number],
] = [
	[830, 838],
	[1082, 1092],
];

/**
 * Icon model: at pitch p the icon scales by p / STATUS_REFERENCE_PITCH about
 * y = STATUS_ICON_CENTER_Y, its kite apex STATUS_APEX_RISE (scaled) above that
 * with 45° flanks. An octoling's dome contains the kite's apex triangle, so
 * the triangle core reads either shape.
 */
export const STATUS_REFERENCE_PITCH = 88;
export const STATUS_ICON_CENTER_Y = 68;
export const STATUS_APEX_RISE = 46;

/**
 * Fit weights (player-status.ts fitSide): the apex edge contrast is the
 * precise term; the gap corners (outside kite and dome alike) keep dome icons
 * readable; team ink inside the apex vs beside it pins alive icons a white X
 * or pale backdrop would otherwise outscore.
 */
export const STATUS_GAP_WEIGHT = 0.5;
export const STATUS_TEAM_WEIGHT = 1;

/**
 * Search effort: fit statistics sample every STATUS_FIT_ROW_STEP-th row, and
 * the coarse 2px grid's best few seeds are refined at 1px.
 */
export const STATUS_FIT_ROW_STEP = 2;
export const STATUS_FIT_REFINED_SEEDS = 3;

/**
 * The previous read's fit holds while it scores within this ratio of the best
 * (single frames mislead: a splat's X stamping in oversized, a team wipe).
 */
export const STATUS_STICKY_SCORE_RATIO = 0.8;

/** The fit carries forward only across reads this close (~1s apart in-match); longer means a new match. */
export const STATUS_FIT_STICKY_MAX_GAP_S = 30;

/**
 * Apex pixel classes, by value (max channel) and saturation (spread / max):
 * ink = saturated team ink of any hue; pale = bright and not saturated (the
 * wash, lilac to near-white); grey = the X strokes and the unlit plate.
 * Saturation as a ratio is what tells a pale lavender wash (spread ~80 at
 * value ~250) from team ink.
 */
export const STATUS_INK_MIN_SATURATION = 0.5;
export const STATUS_INK_MIN_VALUE = 100;
export const STATUS_PALE_MIN_VALUE = 160;
export const STATUS_GREY_MAX_SATURATION = 0.15;
export const STATUS_DARK_MAX_VALUE = 60;

/**
 * Team ink for the fit: within this hue distance of the side's modal ink hue
 * (10° bins), sampled every other pixel over the icons' upper bodies.
 */
export const STATUS_TEAM_MAX_HUE_DIST = 25;
export const STATUS_TEAM_HUE_ROIS: readonly [Roi, Roi] = [
	{ x: 500, y: 45, w: 370, h: 41 },
	{ x: 1050, y: 45, w: 370, h: 41 },
];

/**
 * Slot state off the apex fractions. Over every fixture slot: alive apexes
 * read ink >=0.43 vs <=0.19 otherwise; ready read pale >=0.6 at grey <=0.14,
 * splats grey >=0.18 at pale <=0.38 (a blown-out backdrop through the plate).
 */
export const STATUS_ALIVE_MIN_INK = 0.3;
export const STATUS_READY_MIN_PALE = 0.45;
export const STATUS_READY_MAX_GREY = 0.2;

/**
 * Vacant seat (no player in a 1v1 lobby, or a disconnect): the body (reference
 * px about the icon center line) all but black with no grey X stroke or weapon
 * render in it. Switzerland 1v1 cast: every empty seat read black >=0.85 at
 * grey 0; ~5000 splats elsewhere passed only on 12 frames of the X stamping in
 * oversized and black (the death then starts a read later).
 */
export const STATUS_VACANT_BODY = { top: -20, bottom: 26, halfWidth: 28 };
export const STATUS_VACANT_MIN_DARK = 0.85;
export const STATUS_VACANT_MAX_GREY = 0.03;

// Strip weapon-icon evidence (strip-weapons.ts): masked NCC at the fitted
// scale, calibrated on the sendou-triton VoD (pitches 74-97).

/**
 * Each slot's crop is resampled to the reference pitch: a square of this half
 * size (reference px) about the icon center, nudged down STRIP_WEAPON_CENTER_DY.
 * Leaves room for the template plus the search offsets.
 */
export const STRIP_WEAPON_CROP_HALF = 52;
export const STRIP_WEAPON_CENTER_DY = 1;

/** The game icon's full canvas width at the reference pitch (its art drawn at ~1.05x the pitch). */
export const STRIP_WEAPON_ICON_SIZE = 92;

/** Template pixels count only where the icon art is this opaque, so the plate and backdrop never weigh in. */
export const STRIP_WEAPON_MASK_MIN_ALPHA = 200;

/**
 * Template offsets searched about the crop center (reference px): the fitted
 * centers wobble a few px across a strip, the icon's height barely.
 */
export const STRIP_WEAPON_SEARCH = { x: 4, y: 1 };

/** A half-resolution pass over every weapon shortlists this many for the full-resolution pass. */
export const STRIP_WEAPON_SHORTLIST = 12;

/** The true weapon ranks top-1 on ~93% of single reads; the aggregate needs only the runners-up's score floor. */
export const STRIP_WEAPON_TOP_K = 8;

/** Below this best score the slot holds no weapon render (an empty seat, a covered icon) and is skipped. */
export const STRIP_WEAPON_MIN_SCORE = 0.5;

/** Every Nth counter read samples strip weapons: identities hold all game, so dense reads add nothing. */
export const STRIP_WEAPON_SAMPLE_INTERVAL = 5;

/**
 * Broadcast discriminator (`cast`): the spectator HUD draws white camera badges
 * under the right team's icons, one row per strip arrangement (the ~88px one
 * on SWS26). All four probes must read white (bright AND unsaturated — sky is
 * saturated cyan). Badge frames read >=0.33 (AREA CUP faded row); a white
 * backdrop under a POV strip still fakes a row now and then.
 */
export const STATUS_DPAD_PROBES_NARROW_RIGHT: readonly Roi[] = [
	1105, 1180, 1256, 1332,
].map((cx) => ({ x: cx - 8, y: 102, w: 16, h: 16 }));
export const STATUS_DPAD_PROBES_NARROW_LEFT: readonly Roi[] = [
	1110, 1207, 1303, 1401,
].map((cx) => ({ x: cx - 8, y: 102, w: 16, h: 16 }));
export const STATUS_DPAD_PROBES_EVEN: readonly Roi[] = [
	1107, 1195, 1284, 1372,
].map((cx) => ({ x: cx - 8, y: 102, w: 16, h: 16 }));
export const STATUS_WHITE_MIN_VALUE = 215;
export const STATUS_WHITE_MAX_SPREAD = 40;
export const STATUS_CAST_MIN_DPAD_WHITE = 0.25;

// Tower Control / Rainmaker track overlay (track.ts): a dotted track under the
// icon strip, end to end x514..1405 at y155 in both modes, with the objective's
// icon riding it and each team's "Remaining" plate hanging under the point its
// push reached (so a side's plate always sits on the half it pushes into:
// the left team pushes right). Calibrated on the tower_control / rainmaker VoDs
// (720p upscaled) and the TC/RM death fixtures (German, lime/magenta,
// yellow/purple lobbies).

export const TRACK_Y = 155;
export const TRACK_CENTER_X = 959.5;
export const TRACK_HALF_LENGTH = 445.5;

/**
 * Track dots sit at a fixed pitch and phase in every attested lobby and mode
 * (DFT peak 14.10-14.15 px, dot centers x528.7 + k·14.13), whatever markers
 * cover some of them.
 */
export const TRACK_DOT_PITCH = 14.13;
export const TRACK_FIRST_DOT_X = 528.7;
export const TRACK_COMB_SPAN: readonly [number, number] = [520, 1400];
/** Rows above/below the line a dot stands out from: past its ~9px diameter. */
export const TRACK_COMB_OFFSET_Y = 9;

/**
 * The comb projects each 110px window on its own and drops the two worst: a
 * checkpoint square, an end marker or a backdrop edge along the line (the
 * overhead super-jump camera on Humpback Pump Track) drives a window into
 * anti-phase, which sank a whole-span projection under the floor.
 */
export const TRACK_COMB_WINDOW = 110;
export const TRACK_COMB_DROPPED_WINDOWS = 2;

/**
 * Comb projection at the dot phase: gameplay with the track reads >=26 on
 * every TC/RM fixture, though a low-contrast backdrop leaves little between
 * dots and ground (Humpback Pump Track samples 8-20, purple dots over navy
 * the lowest); every other frame <=7.5 (SZ HUD, lobby, results, the intro,
 * the POV map).
 */
export const GATE_TRACK_MIN_COMB = 11;

/**
 * Held icon: team-ink disc (outer radius ~18) with a white squid glyph filling
 * r7-11. Neutral (the anchor badge, dropped Rainmaker / idle tower): white
 * ring r18-21 around an olive disc r13-16.
 */
export const TRACK_ICON_SPAN: readonly [number, number] = [505, 1415];
export const TRACK_ICON_RING_RADII = [15.5, 16.5, 17.5] as const;
export const TRACK_ICON_CORE_RADII = [8, 9.5, 11] as const;
export const TRACK_NEUTRAL_RING_RADII = [18.5, 19.5, 20.5] as const;
export const TRACK_NEUTRAL_DISC_RADII = [13.5, 14.5, 15.5] as const;
export const TRACK_ICON_Y_JITTER = 1;

/**
 * Icon pixel classes: saturated ink / white glyph / the neutral badge's olive
 * (~130,133,30 in every lobby). Pale sky (~188,220,252) must be neither ink nor
 * white, or a sky backdrop scores as the neutral badge's white ring.
 */
export const TRACK_INK_MIN_SPREAD = 80;
export const TRACK_INK_MIN_VALUE = 90;
export const TRACK_WHITE_MIN_VALUE = 170;
export const TRACK_WHITE_MAX_SPREAD = 55;
/** Olive is duller than team ink: compressed footage reads it at spread ~60. */
export const TRACK_OLIVE_HUE_RANGE: readonly [number, number] = [40, 75];
export const TRACK_OLIVE_MIN_SPREAD = 45;
export const TRACK_OLIVE_MAX_VALUE = 190;

/**
 * Checkpoint markers tell the modes apart: TC squares (31 or 40px, ~3px black
 * frame, pale ink quadrants), RM pedestals (white base ~47px wide at y169, white cap y133-141, ink
 * body above). Squares are scored off the ends (both modes draw rings there);
 * pedestals up to them, as RM's goal pedestals replace the end rings.
 */
export const TRACK_SQUARE_SPAN: readonly [number, number] = [545, 1375];
export const TRACK_PEDESTAL_SPAN: readonly [number, number] = [505, 1415];
export const TRACK_SQUARE_SIZES = [31, 40] as const;
export const TRACK_PEDESTAL = {
	baseY: 169,
	baseHalfWidth: 18,
	bodyY: 160,
	capY: 137,
	capHalfWidth: 10,
};
export const TRACK_MARKER_MIN_SCORE = 0.75;
export const TRACK_MARKER_ICON_CLEARANCE = 30;
export const TRACK_DARK_MAX_VALUE = 60;

/** Shape score (ring fraction × core fraction) an icon must reach. */
export const TRACK_ICON_MIN_SCORE = 0.5;

/** A held icon's ink hue must sit this close to its team's strip hue. */
export const TRACK_ICON_MAX_TEAM_HUE_DIST = 40;

/**
 * "Remaining" plates: localized label over ~35px white digits with a dark
 * outline; digits sit y220-255 wherever the plate slides. The band spans every
 * plate position (centers x514..1405, ~90px wide).
 */
export const TRACK_PLATE_DIGIT_ROI: Roi = { x: 460, y: 214, w: 1000, h: 48 };
export const TRACK_PLATE_TEXT_HEIGHTS = [33, 36] as const;
export const TRACK_PLATE_BIN_THRESHOLD = 190;
export const TRACK_PLATE_DIGIT_MIN_CONF = 0.75;
/** Plate ink sampled beside a digit run: this far out and this tall. */
export const TRACK_PLATE_INK_PAD_X = 10;
/**
 * A plate sits on the half its team pushes into; the tip can reach just past
 * the center when a side's record is still ~100.
 */
export const TRACK_PLATE_CENTER_SLACK = 30;

/**
 * Each team's ink off its own end of the track: the end marker's core (TC
 * ring center, RM pedestal body) and the first four dots are always drawn in
 * the ink of the team defending that end. Kept tight: the backdrop around them
 * is often inked too. The icon only covers them when pushed there by the other
 * team, so they are skipped while it is within reach.
 */
export const TRACK_END_INK_ROIS: readonly [readonly Roi[], readonly Roi[]] =
	(() => {
		const dot = (k: number): Roi => ({
			x: Math.round(TRACK_FIRST_DOT_X + k * TRACK_DOT_PITCH) - 2,
			y: TRACK_Y - 2,
			w: 4,
			h: 4,
		});
		const lastDot = Math.floor((1400 - TRACK_FIRST_DOT_X) / TRACK_DOT_PITCH);
		return [
			[{ x: 508, y: 149, w: 12, h: 12 }, ...[0, 1, 2, 3].map(dot)],
			[
				{ x: 1399, y: 149, w: 12, h: 12 },
				...[0, 1, 2, 3].map((k) => dot(lastDot - k)),
			],
		];
	})();
export const TRACK_END_INK_ICON_CLEARANCE = 25;

/** Fallback: the icon strip (team-ink squid plates) per side; splats and backdrop can drown it. */
export const TRACK_STRIP_INK_ROIS: readonly [Roi, Roi] = [
	{ x: 520, y: 40, w: 370, h: 55 },
	{ x: 1030, y: 40, w: 370, h: 55 },
];
