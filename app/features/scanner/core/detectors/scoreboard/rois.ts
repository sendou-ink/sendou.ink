/**
 * ALL scoreboard ROI coordinates, in canonical 1920x1080 space.
 * Calibrated against scoreboard/xbattle-splat-zones-ko via
 * tools/overlay-rois.ts and column-projection measurement.
 *
 * The results-screen scoreboard is a fixed-layout panel on the right side:
 * two team boxes (top = winner, bottom = loser), 4 dark "pill" rows each,
 * white text on the pills. Per row, left to right: avatar, weapon icon,
 * name (left-aligned from x=1125), paint ("842p", digits right-aligned
 * ending at x=1409, constant "p" glyph at 1411-1424), three stat counters
 * ("x12", zero-padded 2 digits) under the splat/death/special icons.
 */
import type { Roi } from "../../canonical";

/** Vertical centers of the 8 player rows: 4 winner rows, then 4 loser rows. */
export const ROW_CENTERS = [416, 482, 547, 613, 770, 836, 901, 967] as const;

/**
 * Weapon icon search region within a row. matchTemplate skips templates
 * taller than the region, so 56px fits the largest live icon while
 * excluding replay-browser template sizes.
 */
export function weaponRoi(cy: number): Roi {
	return { x: 1054, y: cy - 28, w: 67, h: 56 };
}

/**
 * Player name text region (white, left-aligned x=1126). Long names run
 * into the paint column; parse paint first and trim at its leftmost digit.
 */
export function nameRoi(cy: number): Roi {
	return { x: 1122, y: cy - 14, w: 208, h: 32 };
}

/** Paint amount digits, right-aligned ending at x=1409 (the "p" suffix is excluded). */
export function paintRoi(cy: number): Roi {
	return { x: 1325, y: cy - 17, w: 84, h: 34 };
}

/** The constant white "p" after the paint number — used as a gate anchor. */
export function paintSuffixRoi(cy: number): Roi {
	return { x: 1409, y: cy - 14, w: 18, h: 28 };
}

/** Stat counter digits (two, zero-padded; the small "x" prefix at 1477/1540/1603 is excluded). */
export function statRoi(cy: number, index: 0 | 1 | 2): Roi {
	const x = [1484, 1547, 1610][index]!;
	return { x, y: cy + 1, w: 32, h: 23 };
}

/**
 * Special-weapon icon above the specials counter (~22px art, team ink
 * color). Bounded at cy+1 so counter digits stay out of the binarized shape.
 */
export function specialIconRoi(cy: number): Roi {
	return { x: 1595, y: cy - 29, w: 40, h: 30 };
}

/**
 * POV arrow: yellow arrow marking the recording player's row, left of the
 * avatar (x 933-985). Right edge stays short of the avatar circle (~x 995).
 */
export function povArrowRoi(cy: number): Roi {
	return { x: 930, y: cy - 32, w: 58, h: 56 };
}

/**
 * Team point totals ("500 p"), right-aligned ending x=1658. Only read to
 * recognize a knockout (winner total 500) — not the match score.
 */
export const TEAM_SCORE_ROIS: readonly [Roi, Roi] = [
	{ x: 1530, y: 330, w: 132, h: 44 },
	{ x: 1530, y: 684, w: 132, h: 44 },
];

/**
 * The two sides of the "Score:" banner. Left is left-aligned from x~946,
 * right right-aligned ending x~1691 (x~1712 mid-pop) — digits bounce
 * ~28-39px as the value lands (MATCH_SCORE_DIGIT_HEIGHTS).
 */
export const MATCH_SCORE_ROIS: readonly [Roi, Roi] = [
	{ x: 935, y: 231, w: 230, h: 50 },
	{ x: 1600, y: 231, w: 125, h: 50 },
];

/** Banner score digit sizes: settled, and the landing bounce's peak. */
export const MATCH_SCORE_DIGIT_HEIGHTS = [28, 39] as const;

/**
 * Gate probe: the strip between the paint "p" suffix (ends 1424) and the
 * first stat "x" (starts 1477) is always empty pill background (near-black).
 */
export function gateDarkProbe(cy: number): Roi {
	return { x: 1434, y: cy - 10, w: 38, h: 20 };
}

/** Panel background probes (dark gray ~35) outside the team boxes. */
export const GATE_PANEL_PROBES: readonly Roi[] = [
	{ x: 800, y: 500, w: 30, h: 30 },
	{ x: 800, y: 900, w: 30, h: 30 },
	{ x: 1770, y: 930, w: 30, h: 30 },
];

export const GATE_DARK_MAX_MEAN = 60;
export const GATE_PANEL_MAX_MEAN = 85;
/** The paint "p" suffix region must contain bright (white) pixels. */
export const GATE_TEXT_MIN_MAX = 180;

/**
 * Header bands: lobby tag ("X Battle") on its own line, mode+stage share
 * the next. Tags size to their text, so bands are generous — header.ts
 * trims each to the actual tag extent.
 */
export const HEADER_LOBBY_BAND: Roi = { x: 828, y: 42, w: 330, h: 30 };
export const HEADER_LINE_BAND: Roi = { x: 828, y: 88, w: 580, h: 40 };

/** Text metrics measured on the fixture, used by atlas tooling. */
export const PAINT_DIGIT_HEIGHT = 28;
/** Same tight height as paint digits, but rendered in the bold face (BlitzBold). */
export const TEAM_DIGIT_HEIGHT = 28;
