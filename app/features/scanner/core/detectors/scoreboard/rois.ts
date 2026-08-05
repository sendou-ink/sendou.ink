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
 * Weapon icon search region within a row (icon size/offset varies per
 * weapon). matchTemplate silently skips any template taller than the
 * region, so the 56px height both fits the largest live-scoreboard icon
 * and intentionally excludes the larger replay-browser template sizes.
 */
export function weaponRoi(cy: number): Roi {
	return { x: 1054, y: cy - 28, w: 67, h: 56 };
}

/**
 * Player name text region (white text, left-aligned starting x=1126).
 * Long names run into the paint column; parse paint first and trim this
 * region at the leftmost paint digit.
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
 * The player's special-weapon icon, drawn above the specials counter in the
 * team's ink color (~22px art around x 1602-1624, y cy-22..cy+1). Bounded
 * below at cy+1 so the white counter digits stay out of the binarized shape.
 */
export function specialIconRoi(cy: number): Roi {
	return { x: 1595, y: cy - 29, w: 40, h: 30 };
}

/**
 * POV arrow probe: the yellow arrow marking the recording player's row sits
 * left of the avatar, overlapping the team-box edge (measured x 933-985,
 * y cy-29..cy+23 across fixtures). Right edge stays short of the avatar
 * circle (~x 995) so yellow hair/gear can't leak in.
 */
export function povArrowRoi(cy: number): Roi {
	return { x: 930, y: cy - 32, w: 58, h: 56 };
}

/**
 * Team point totals ("500 p"), larger digits, right-aligned ending at
 * x=1658. Only read to recognize a knockout (winner total 500) — the
 * totals are the count times five, not the match score.
 */
export const TEAM_SCORE_ROIS: readonly [Roi, Roi] = [
	{ x: 1530, y: 330, w: 132, h: 44 },
	{ x: 1530, y: 684, w: 132, h: 44 },
];

/**
 * The two sides of the colored "Score:" banner above the team boxes. The
 * left side's text is left-aligned from x~946 (digits directly there when
 * the language renders no label), the right side's right-aligned ending at
 * x~1691 — or x~1712 mid-pop, the digits bounce between ~28px and ~39px as
 * the value lands (MATCH_SCORE_DIGIT_HEIGHTS). Boxes cover both sizes plus
 * the label overlap the trailing-digit parse tolerates.
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
 * Header bands. The lobby tag ("X Battle") sits on its own line; mode and
 * stage tags share the next line. Tags are black boxes that size to their
 * text, so these bands are generous — header.ts trims each band to the
 * actual tag extent (map thumbnail pixels around the tags are excluded by
 * column statistics, not by fixed coordinates).
 */
export const HEADER_LOBBY_BAND: Roi = { x: 828, y: 42, w: 330, h: 30 };
export const HEADER_LINE_BAND: Roi = { x: 828, y: 88, w: 580, h: 40 };

/** Text metrics measured on the fixture, used by atlas tooling. */
export const PAINT_DIGIT_HEIGHT = 28;
/** Same tight height as paint digits, but rendered in the bold face (BlitzBold). */
export const TEAM_DIGIT_HEIGHT = 28;
