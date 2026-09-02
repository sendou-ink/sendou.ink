/**
 * Battle-log ROIs in canonical 1920x1080 space, calibrated against the
 * private-battle-splat-zones-makomart and x-battle-clam-blitz-lemuria fixtures.
 * Two panels STACKED (bottom = top + PANEL_DY), four near-black pill rows each,
 * team ink on the top band. Text sizes match the live scoreboard. Above: split
 * "Score:"/KNOCKOUT! banner and header (timestamp + stage / lobby + mode).
 */
import type { Roi } from "../../canonical";

/** Vertical centers of the 4 player rows within the top panel. */
export const ROW_CENTERS = [453, 519, 585, 651] as const;

/** Vertical shift from a top-panel ROI to its bottom-panel twin. */
export const PANEL_DY = 366;

/** dy per panel: [top (index 0), bottom (index 1)]. */
export const PANEL_DYS = [0, PANEL_DY] as const;

/** Icons at live-scoreboard sizes; 56px height excludes the larger replay-browser templates. */
export function weaponRoi(cy: number): Roi {
	return { x: 1040, y: cy - 28, w: 76, h: 56 };
}

/**
 * Special icon above the third stat (~x 1645-1692), read only to break near-tied weapons; bounded
 * at cy+2 to keep digits out.
 */
export function specialIconRoi(cy: number): Roi {
	return { x: 1642, y: cy - 24, w: 52, h: 26 };
}

/** Name text from x=1114; long names run into paint, trim at its leftmost digit. */
export function nameRoi(cy: number): Roi {
	return { x: 1110, y: cy - 14, w: 208, h: 32 };
}

/** Paint amount digits, right-aligned ending at x=1396 (the "p" suffix is excluded). */
export function paintRoi(cy: number): Roi {
	return { x: 1312, y: cy - 17, w: 88, h: 34 };
}

/** The constant white "p" after the paint number — used as a gate anchor. */
export function paintSuffixRoi(cy: number): Roi {
	return { x: 1398, y: cy - 14, w: 18, h: 28 };
}

/** Stat counter digits (two, zero-padded; the small "x" prefix is excluded). */
export function statRoi(cy: number, index: 0 | 1 | 2): Roi {
	const x = [1530, 1593, 1656][index]!;
	return { x, y: cy + 3, w: 30, h: 22 };
}

/** POV arrow left of the pill (x 977-1024), short of the pill's rounded cap (~x 1032). */
export function povArrowRoi(cy: number): Roi {
	return { x: 968, y: cy - 32, w: 60, h: 62 };
}

/** Team totals ("500 p") ending x=1704, read only to recognize a knockout (500). */
export function teamScoreRoi(dy: number): Roi {
	return { x: 1614, y: 371 + dy, w: 96, h: 38 };
}

/** VICTORY/DEFEAT tag (team ink on gray stamp); observed winner always on top. */
export function resultTagRoi(dy: number): Roi {
	return { x: 990, y: 358 + dy, w: 215, h: 52 };
}

/**
 * "Score:" banner sides: left follows the localized label (x~985), right ends x~1744; a knockout
 * replaces the winner's value.
 */
export const MATCH_SCORE_ROIS: readonly [Roi, Roi] = [
	{ x: 985, y: 278, w: 265, h: 40 },
	{ x: 1648, y: 278, w: 100, h: 40 },
];

/**
 * Header bands: timestamp + stage (a rank icon shifts the left edge on ranked
 * lobbies), lobby + mode. Bands hug the tags since the photo below inks glyph
 * bottoms; readTagBand scans for the tag start (HEADER_TAG_LEAD_IN_MAX).
 */
export const HEADER_TOP_BAND: Roi = { x: 800, y: 74, w: 668, h: 32 };
export const HEADER_BOTTOM_BAND: Roi = { x: 800, y: 122, w: 728, h: 46 };
export const HEADER_TAG_LEAD_IN_MAX = 40;
/** see TagBandOptions.tagColumnFraction — the tags are subtly tilted */
export const HEADER_TAG_COLUMN_FRACTION = 0.75;

/** Strip between paint "p" (ends 1413) and first stat "x" (starts 1517): empty pill background (~20). */
export function gateDarkProbe(cy: number): Roi {
	return { x: 1422, y: cy - 10, w: 78, h: 20 };
}

/**
 * Ink-color probes vs lookalikes: top bands and score banner are saturated here
 * (109+), the live scoreboard is gray and the replay browser only saturates the first spot.
 */
export const GATE_COLOR_PROBES: readonly Roi[] = [
	{ x: 1300, y: 382, w: 100, h: 16 },
	{ x: 1300, y: 748, w: 100, h: 16 },
	{ x: 1400, y: 292, w: 60, h: 14 },
];

/** Mean-RGB saturation (max minus min channel) floor for the color probes. */
export const GATE_COLOR_MIN_SATURATION = 60;

/** The strip between p suffix and stats must stay near-black. */
export const GATE_DARK_MAX_MEAN = 45;
/** The paint "p" suffix region must contain bright (white) pixels. */
export const GATE_TEXT_MIN_MAX = 180;

/** Text metrics measured on the fixtures, used for glyph scaling / tooling. */
export const MATCH_SCORE_DIGIT_HEIGHT = 28;
export const HEADER_TIMESTAMP_HEIGHT = 21;
export const HEADER_LINE_HEIGHT = 26;
export const RESULT_TAG_TEXT_HEIGHT = 30;
