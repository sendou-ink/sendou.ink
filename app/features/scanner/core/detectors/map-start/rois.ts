/**
 * ALL map-start ROI coordinates, in canonical 1920x1080 space.
 * Calibrated against the map-start/ fixtures via row/column profiling.
 *
 * The match-intro splash overlays live gameplay: a black ink splat
 * top-center with the constant "MODE" label (~48px caps), the mode title
 * (~76px BlitzBold, up to two lines), and an objective subtitle; the
 * stage name bottom-right (~40px); and eight players' splash tags along
 * the left/right edges.
 */
import type { Roi } from "../../canonical";

/**
 * The constant "MODE" label (white caps centered x=960), kept tight
 * inside the label's black pill (x≈825-1110): on bright stages
 * (Mahi-Mahi) a wider crop picks up background that garbles the read.
 */
export const MODE_LABEL_ROI: Roi = { x: 850, y: 268, w: 220, h: 62 };
export const MODE_LABEL_TEXT_HEIGHT = 48;

/**
 * Mode title block below the label, one or two lines (parse finds lines
 * by row projection, not fixed positions). Ends above the objective
 * subtitle (~y678); wide enough for the longest title ("Herrschaft" /
 * "Spetterzone" ~660px) — at 520 wide the German H/t clipped ("lerrschaf").
 */
export const MODE_BLOCK_ROI: Roi = { x: 620, y: 380, w: 680, h: 285 };
export const MODE_TEXT_HEIGHT = 76;

/** A block row is text when it has at least this many bright pixels... */
export const LINE_MIN_ROW_PIXELS = 40;
/**
 * ...and at least this fraction of the block's strongest row: background
 * leak past the splat rim sets a scene-dependent floor (Robo ROM-en's
 * bright mall merged title + junk into one 227px band without this).
 */
export const LINE_ROW_FRACTION = 0.25;
/** Text rows closer than this merge into one line band. */
export const LINE_GAP_TOLERANCE = 8;
/** Discard bands shorter than this (splat-texture speckle, drips). */
export const LINE_MIN_HEIGHT = 40;

/** Stage name, bottom-right over live gameplay. */
export const STAGE_ROI: Roi = { x: 1300, y: 984, w: 600, h: 56 };
export const STAGE_TEXT_HEIGHT = 40;

/** White text on the near-black splat binarizes cleanly and high. */
export const TEXT_BIN_THRESHOLD = 190;

/**
 * Bright-background suppression (light stages like Mahi-Mahi: water ~200
 * gray, docks 230+): text counts only near a near-black pixel (title
 * borders splat ink, stage name has a drop shadow). Radius must exceed
 * stroke half-width or it eats glyph cores: ~12 for the title, ~6 for
 * the stage line.
 */
export const MASK_DARK_MAX = 70;
export const BLOCK_MASK_RADIUS = 12;
export const STAGE_MASK_RADIUS = 6;
/**
 * Stage line also reads the per-pixel min channel at a higher threshold
 * (blue water drops via its low red channel, white glyphs stay near 255).
 * When the mask fails on an all-bright backdrop (Robo ROM-en's mall
 * floor), parse tries the raw crop at these thresholds and keeps the best.
 */
export const STAGE_BIN_THRESHOLD = 210;
export const STAGE_RAW_BIN_THRESHOLDS: readonly number[] = [225, 235, 245];

/**
 * Gate probes: splat ink flanking the "MODE" label and before the title,
 * on spots verified solid across fixtures (mean ≤8, well above ink yet
 * under the dark scoreboard pills ~51+). Flanking pair sits outside x
 * 838-1082, past the widest label text ("Kampfart", "Vechtstijl").
 */
export const GATE_DARK_PROBES: readonly Roi[] = [
	{ x: 780, y: 280, w: 30, h: 20 },
	{ x: 1105, y: 280, w: 30, h: 20 },
	{ x: 850, y: 355, w: 30, h: 20 },
	{ x: 1030, y: 355, w: 30, h: 20 },
];
export const GATE_DARK_MAX_MEAN = 45;

/**
 * Core of the label-to-title gap is solid splat ink: near-total darkness,
 * zero bright pixels. Death's "Splatted by" line runs through here
 * (bright fraction 0.17+); scoreboard pills only reach ~0.83 dark.
 */
export const GATE_INK_BAND: Roi = { x: 840, y: 350, w: 230, h: 36 };
export const GATE_INK_BAND_MAX_BRIGHT = 0.005;
export const GATE_INK_BAND_MIN_DARK = 0.95;

/** MODE_LABEL_ROI must contain near-white pixels... */
export const GATE_TEXT_MIN_MAX = 210;
/** ...at a text fill fraction: "MODE" fills ~0.25 of the tight ROI, while
 * stray white on the other screens stays under ~0.13. */
export const GATE_TEXT_MIN_FRACTION = 0.05;
export const GATE_TEXT_MAX_FRACTION = 0.35;
