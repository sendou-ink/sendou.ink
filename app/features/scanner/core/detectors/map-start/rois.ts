/**
 * Map-start ROIs in canonical 1920x1080 space, calibrated against the map-start/
 * fixtures. The intro splash overlays gameplay: black splat top-center with the
 * "MODE" label (~48px), mode title (~76px, up to two lines) and objective
 * subtitle; stage name bottom-right (~40px); splash tags along both edges.
 */
import type { Roi } from "../../canonical";

/** "MODE" label, kept tight inside its black pill (x≈825-1110): a wider crop picks up background on bright stages. */
export const MODE_LABEL_ROI: Roi = { x: 850, y: 268, w: 220, h: 62 };
export const MODE_LABEL_TEXT_HEIGHT = 48;

/**
 * Mode title block, 1-2 lines found by row projection. Ends above the objective
 * subtitle (~y678); 680 wide fits "Herrschaft"/"Spetterzone" (~660px, clipped at 520).
 */
export const MODE_BLOCK_ROI: Roi = { x: 620, y: 380, w: 680, h: 285 };
export const MODE_TEXT_HEIGHT = 76;

/** A block row is text when it has at least this many bright pixels... */
export const LINE_MIN_ROW_PIXELS = 40;
/**
 * ...and this fraction of the strongest row: background leak sets a scene-dependent floor (Robo
 * ROM-en merged title + junk into one band without it).
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
 * Bright-background suppression (Mahi-Mahi water ~200, docks 230+): text counts
 * only near a near-black pixel (splat ink / drop shadow). Radius must exceed
 * stroke half-width or it eats glyph cores.
 */
export const MASK_DARK_MAX = 70;
export const BLOCK_MASK_RADIUS = 12;
export const STAGE_MASK_RADIUS = 6;
/**
 * Stage line reads the min channel at a higher threshold (blue water drops via
 * its red channel). When the mask fails on an all-bright backdrop (Robo ROM-en),
 * the raw crop is tried at these thresholds.
 */
export const STAGE_BIN_THRESHOLD = 210;
export const STAGE_RAW_BIN_THRESHOLDS: readonly number[] = [225, 235, 245];

/**
 * Gate probes on splat ink flanking the label and before the title (fixture
 * mean ≤8; scoreboard pills ~51+). Flanking pair sits past the widest label
 * text ("Kampfart", "Vechtstijl").
 */
export const GATE_DARK_PROBES: readonly Roi[] = [
	{ x: 780, y: 280, w: 30, h: 20 },
	{ x: 1105, y: 280, w: 30, h: 20 },
	{ x: 850, y: 355, w: 30, h: 20 },
	{ x: 1030, y: 355, w: 30, h: 20 },
];
export const GATE_DARK_MAX_MEAN = 45;

/**
 * Label-to-title gap is solid ink; death's "Splatted by" line crosses it (bright 0.17+), scoreboard
 * pills only ~0.83 dark.
 */
export const GATE_INK_BAND: Roi = { x: 840, y: 350, w: 230, h: 36 };
export const GATE_INK_BAND_MAX_BRIGHT = 0.005;
export const GATE_INK_BAND_MIN_DARK = 0.95;

/** MODE_LABEL_ROI must contain near-white pixels... */
export const GATE_TEXT_MIN_MAX = 210;
/** ...at a text fill fraction: "MODE" fills ~0.25, stray white elsewhere stays under ~0.13. */
export const GATE_TEXT_MIN_FRACTION = 0.05;
export const GATE_TEXT_MAX_FRACTION = 0.35;
