/**
 * Replay-browser ROIs in canonical 1920x1080 space, calibrated against the
 * private-battle-splat-zones-hagglefish fixture. Two team panels SIDE BY SIDE
 * (right = left + PANEL_DX), four mid-gray pill rows each (~61, gaps ~23; the
 * live scoreboard's pills are ~12). Below: green replay code; above: two
 * "Score:" banners and the header (timestamp + stage / lobby + mode).
 */
import type { Roi } from "../../canonical";

/** Vertical centers of the 4 player rows within each panel. */
export const ROW_CENTERS = [573, 654, 735, 816] as const;

/** Horizontal shift from a left-panel ROI to its right-panel twin. */
export const PANEL_DX = 676;

/** dx per panel: [left (index 0), right (index 1)]. */
export const PANEL_XS = [0, PANEL_DX] as const;

/** Full pill height so the largest template (64; icons ~60-64px) fits with slide room. */
export function weaponRoi(cy: number, dx: number): Roi {
	return { x: 522 + dx, y: cy - 34, w: 96, h: 68 };
}

/**
 * Special icon on a black disc above the third stat (~25x29 at x 1109-1134),
 * only read to break near-tied weapons. Box stays inside the disc: the mid-gray
 * pill sits above matchSpecial's ink threshold.
 */
export function specialIconRoi(cy: number, dx: number): Roi {
	return { x: 1104 + dx, y: cy - 32, w: 38, h: 33 };
}

/** Name text (descenders reach cy+18); long names run into the paint column, trim at its leftmost digit. */
export function nameRoi(cy: number, dx: number): Roi {
	return { x: 620 + dx, y: cy - 16, w: 226, h: 37 };
}

/**
 * Paint digits, LEFT-aligned from x~843; the trailing "p" lands inside on 3-digit paints
 * (digit-only charset drops it).
 */
export function paintRoi(cy: number, dx: number): Roi {
	return { x: 821 + dx, y: cy - 15, w: 88, h: 34 };
}

/** Gate anchor over the paint "p", spanning both positions (x 898-907 after 3 digits, 915-924 after 4). */
export function paintSuffixRoi(cy: number, dx: number): Roi {
	return { x: 896 + dx, y: cy - 13, w: 31, h: 26 };
}

/** Stat digits ("x" prefix excluded); top edge must stay below the stat icons' ink bleed. */
export function statRoi(cy: number, dx: number, index: 0 | 1 | 2): Roi {
	const x = [1000, 1057, 1114][index]!;
	return { x: x + dx, y: cy + 3, w: 36, h: 24 };
}

/** POV arrow on the pill's left edge (x 487-530), short of the weapon region (x 522+). */
export function povArrowRoi(cy: number, dx: number): Roi {
	return { x: 480 + dx, y: cy - 32, w: 54, h: 56 };
}

/** Team totals ("440p") on the VICTORY/DEFEAT banner, digits ending x~1119. */
export function teamScoreRoi(dx: number): Roi {
	return { x: 1040 + dx, y: 481, w: 86, h: 36 };
}

/** VICTORY / DEFEAT tag on each panel banner — decides which panel won (owner's team may sit either side). */
export function resultTagRoi(dx: number): Roi {
	return { x: 540 + dx, y: 460, w: 220, h: 50 };
}

/** The colored "Score: NN" banners; digits after the constant label. */
export const MATCH_SCORE_ROIS: readonly [Roi, Roi] = [
	{ x: 742, y: 340, w: 130, h: 56 },
	{ x: 1620, y: 340, w: 130, h: 56 },
];

/** Header bands: line 1 timestamp + stage, line 2 lobby + mode; the parser trims each to the tag extent. */
export const HEADER_TOP_BAND: Roi = { x: 500, y: 68, w: 560, h: 46 };
/** Runs past the longest observed pair ("Anarchy Battle (Open)" + "Rainmaker" ends x~1134). */
export const HEADER_BOTTOM_BAND: Roi = { x: 500, y: 124, w: 700, h: 58 };

/** Green replay code, left-aligned after the magnifier; a wide-letter code can run past x=913. */
export const REPLAY_CODE_ROI: Roi = { x: 574, y: 960, w: 400, h: 38 };

/** Gate probe: flat pill background strip between paint "p" and first stat "x" — mid-gray here, not near-black. */
export function gateFlatProbe(cy: number, dx: number): Roi {
	return { x: 930 + dx, y: cy - 10, w: 42, h: 20 };
}

/** Dark gap between row 1 and row 2 pills, one strip per panel. */
export const GATE_GAP_PROBES: readonly Roi[] = [
	{ x: 560, y: 611, w: 540, h: 5 },
	{ x: 560 + PANEL_DX, y: 611, w: 540, h: 5 },
];

/** Flat pill strips must sit in this mid-gray band. */
export const GATE_FLAT_MIN_MEAN = 45;
export const GATE_FLAT_MAX_MEAN = 78;
/** The inter-pill gap is darker than the pills. */
export const GATE_GAP_MAX_MEAN = 40;
/** The paint "p" suffix region must contain bright pixels. */
export const GATE_TEXT_MIN_MAX = 180;
/**
 * Replay-code color probe: fraction of REPLAY_CODE_ROI pixels that are green-ish (high G, low B) —
 * unique to this screen.
 */
export const GATE_CODE_GREEN_MIN = 140;
export const GATE_CODE_BLUE_MAX = 90;
export const GATE_CODE_MIN_FRACTION = 0.03;

/** Text metrics measured on the fixture, used for glyph scaling / tooling. */
export const NAME_TEXT_HEIGHT = 24;
export const PAINT_DIGIT_HEIGHT = 26;
export const STAT_DIGIT_HEIGHT = 20;
export const TEAM_DIGIT_HEIGHT = 27;
export const MATCH_SCORE_DIGIT_HEIGHT = 41;
export const HEADER_TIMESTAMP_HEIGHT = 24;
export const HEADER_LINE_HEIGHT = 29;
export const RESULT_TAG_TEXT_HEIGHT = 27;
export const CODE_TEXT_HEIGHT = 25;
