/**
 * Kill-feed ROIs in canonical 1920x1080 space, calibrated against the kill/
 * fixtures (row/column brightness profiling). Every splat by the POV player
 * draws one dark pill bottom-center (x703..1217, 50px tall) holding a white
 * skull, a team-ink squid and the "Splatted <name>!" line — BlitzMain, caps
 * y1004..1028, centered in the text area right of the icons. A further splat
 * adds a pill at the bottom and shifts the older ones up by ROW_PITCH (a
 * ~15px gap of gameplay shows between pills); the bottom row is the newest.
 */
import type { Roi } from "../../canonical";

/** A wipeout is four rows; a respawned enemy can't re-enter before the oldest row expires. */
export const MAX_ROWS = 4;

/** Text caps sit at y1004 on the bottom row and y938 on the one above. */
const ROW_PITCH = 66;

/** Bottom row's text band: from the squid icon's right edge to the pill's plain right end, with drift headroom. */
const TEXT_ROI_BOTTOM: Roi = { x: 796, y: 997, w: 412, h: 38 };

/** Tight cap height of the row text (atlas nominal height). */
export const KILL_TEXT_HEIGHT = 24;

/**
 * The atlas scaled up one pixel reads both the native-1080p and the
 * 720p-upscaled fixture best (0.81-0.88 vs 0.73-0.76 at nominal): the game's
 * compositing fattens strokes the way the cubic upscale does.
 */
export const KILL_TEXT_READ_HEIGHT = 25;

/** White text on the near-black pill; the squid icon's tint stays well under. */
export const KILL_TEXT_BIN_THRESHOLD = 150;

/**
 * Pill-interior dark probes of the bottom row: the margin left of the skull,
 * the plain right end (the barcode decoration there reads ~30 too), and the
 * bands above and below the text line. Fixtures read 25..34 on each.
 */
const DARK_PROBES_BOTTOM: readonly Roi[] = [
	{ x: 706, y: 998, w: 18, h: 34 },
	{ x: 1196, y: 998, w: 10, h: 34 },
	{ x: 850, y: 992, w: 250, h: 6 },
	{ x: 850, y: 1031, w: 250, h: 6 },
];
export const GATE_DARK_MAX_MEAN = 70;

/** The white skull icon left of the squid: bright art on the dark pill. */
const SKULL_ROI_BOTTOM: Roi = { x: 729, y: 1002, w: 28, h: 28 };
export const GATE_SKULL_MIN_MAX = 200;
export const GATE_SKULL_MIN_MEAN = 60;
export const GATE_SKULL_MAX_MEAN = 210;

/** The text band must contain near-white pixels... */
export const GATE_TEXT_MIN_MAX = 210;
/** ...but not too many: it is one short line, not a white panel. */
export const GATE_TEXT_MAX_FRACTION = 0.35;
export const GATE_TEXT_MIN_FRACTION = 0.01;

function shiftedUp(roi: Roi, row: number): Roi {
	return { ...roi, y: roi.y - row * ROW_PITCH };
}

/** Row 0 is the bottom (newest) pill; each further row sits ROW_PITCH higher. */
export function textRoi(row: number): Roi {
	return shiftedUp(TEXT_ROI_BOTTOM, row);
}

export function darkProbes(row: number): Roi[] {
	return DARK_PROBES_BOTTOM.map((roi) => shiftedUp(roi, row));
}

export function skullRoi(row: number): Roi {
	return shiftedUp(SKULL_ROI_BOTTOM, row);
}
