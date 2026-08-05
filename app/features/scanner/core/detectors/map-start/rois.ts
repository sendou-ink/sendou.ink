/**
 * ALL map-start ROI coordinates, in canonical 1920x1080 space.
 * Calibrated against the map-start/ fixtures via row/column profiling.
 *
 * The match-intro splash overlays live gameplay with:
 * - a big black ink splat top-center carrying the constant "MODE" label
 *   (~48px BlitzMain caps), the mode title in large BlitzBold (~76px tight
 *   caps, wrapping to two lines for the longer mode names), and an
 *   objective subtitle below it;
 * - the stage name bottom-right in BlitzMain (~40px tight height);
 * - the eight players' splash tags along the left/right edges.
 */
import type { Roi } from "../../canonical";

/**
 * The constant "MODE" label (white caps centered at x=960). Kept tight
 * inside the label's black pill (x≈825-1110): the splash sits on live
 * gameplay, and on bright stages (Mahi-Mahi's water/docks) a wider crop
 * picks up background past the pill edges that garbles the label read.
 */
export const MODE_LABEL_ROI: Roi = { x: 850, y: 268, w: 220, h: 62 };
export const MODE_LABEL_TEXT_HEIGHT = 48;

/**
 * The mode title block below the label. The title is one or two lines
 * depending on the mode name; parse finds the actual lines by row
 * projection instead of assuming positions. Ends above the objective
 * subtitle (~y678) so the subtitle never leaks into the last band. Wide
 * enough for the longest single-line localized titles ("Herrschaft",
 * "Spetterzone" — ~660px centered on 960): at 520 wide the German H/t
 * were clipped off and the title read "lerrschaf".
 */
export const MODE_BLOCK_ROI: Roi = { x: 620, y: 380, w: 680, h: 285 };
export const MODE_TEXT_HEIGHT = 76;

/** A block row is text when it has at least this many bright pixels... */
export const LINE_MIN_ROW_PIXELS = 40;
/**
 * ...and at least this fraction of the block's strongest row: background
 * leaking past the splat's rim puts a scene-dependent floor under every
 * row (Robo ROM-en's bright mall merged the title and the junk below it
 * into one 227px band at the fixed threshold alone).
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
 * Bright-background suppression (needed on light stages like Mahi-Mahi,
 * where water reads ~200 gray and white docks 230+): a pixel only counts
 * as text when a near-black pixel sits within the mask radius — the mode
 * title borders the splat ink and the stage name carries a dark drop
 * shadow, while open bright background has no darkness nearby. The radius
 * must exceed the text's stroke half-width or it eats the glyph cores:
 * ~12 for the 76px title (band finding only; the OCR runs on the raw
 * crop), ~6 for the 40px stage line.
 */
export const MASK_DARK_MAX = 70;
export const BLOCK_MASK_RADIUS = 12;
export const STAGE_MASK_RADIUS = 6;
/**
 * The stage line reads the per-pixel min channel at a higher threshold:
 * blue-tinted water drops with its low red channel while the white glyph
 * cores stay near 255. The near-dark mask fails when the backdrop is
 * brighter than the mask threshold everywhere (Robo ROM-en's white mall
 * floor fuses into the glyphs), so parse also tries the raw crop at these
 * rising thresholds — the text's saturated core outlasts a nearly-white
 * floor — and keeps whichever read snaps best.
 */
export const STAGE_BIN_THRESHOLD = 210;
export const STAGE_RAW_BIN_THRESHOLDS: readonly number[] = [225, 235, 245];

/**
 * Gate probes: splat ink flanking the "MODE" label and in the gap between
 * the label and the title. The splat texture has holes that show the scene
 * behind it (bright water on Mahi-Mahi), so these sit on spots verified
 * solid across the fixtures (mean ≤8 regardless of the scene); the
 * threshold is well above ink yet under the dark scoreboard pills (~51+).
 * The flanking pair sits outside x 838-1082, the widest any language's
 * label text reaches ("Kampfart", "Vechtstijl") — closer in, the label's
 * own white strokes blow the probe means.
 */
export const GATE_DARK_PROBES: readonly Roi[] = [
	{ x: 780, y: 280, w: 30, h: 20 },
	{ x: 1105, y: 280, w: 30, h: 20 },
	{ x: 850, y: 355, w: 30, h: 20 },
	{ x: 1030, y: 355, w: 30, h: 20 },
];
export const GATE_DARK_MAX_MEAN = 45;

/**
 * The core of the label-to-title gap is solid splat ink (no texture
 * holes): near-total darkness and zero bright pixels. The death burst
 * runs its "Splatted by" line through this band (bright fraction 0.17+)
 * and the scoreboards' dark pills only reach ~0.83 dark fraction.
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
