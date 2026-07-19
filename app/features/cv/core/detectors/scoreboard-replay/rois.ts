/**
 * ALL scoreboard-replay ROI coordinates, in canonical 1920x1080 space.
 * Calibrated against scoreboard-replay/private-battle-splat-zones-hagglefish
 * via tools/overlay-rois.ts and column-projection measurement.
 *
 * The replay-browser detail screen shows the two team panels SIDE BY SIDE
 * (left panel first, right panel = left shifted by PANEL_DX), four gray
 * pill rows each. Unlike the live scoreboard's near-black pills (~12),
 * replay pills are mid-gray (~61) with darker gaps (~23) between them.
 * Below the panels sit the replay owner line and the bright green replay
 * code; above them, the two "Score:" banners and the stage-photo header
 * with black auto-sized tags (line 1 = timestamp + stage, line 2 = lobby
 * + mode).
 */
import type { Roi } from "../../canonical";

/** Vertical centers of the 4 player rows within each panel. */
export const ROW_CENTERS = [573, 654, 735, 816] as const;

/** Horizontal shift from a left-panel ROI to its right-panel twin. */
export const PANEL_DX = 676;

/** dx per panel: [left (index 0), right (index 1)]. */
export const PANEL_XS = [0, PANEL_DX] as const;

/**
 * Weapon icon search region within a row — the full pill height, so the
 * largest weapon template (64; replay icons render at ~60-64px) fits with
 * vertical slide room. matchTemplate silently skips taller templates.
 */
export function weaponRoi(cy: number, dx: number): Roi {
	return { x: 522 + dx, y: cy - 34, w: 96, h: 68 };
}

/**
 * The player's special-weapon icon, drawn on a black disc above the third
 * stat counter (measured art ~25x29 at x 1109-1134, y cy-29..cy across
 * fixtures). Only read to break near-tied weapon-icon matches whose kits
 * carry different specials. The box stays inside the disc: the mid-gray
 * pill around it sits above matchSpecial's ink threshold.
 */
export function specialIconRoi(cy: number, dx: number): Roi {
	return { x: 1104 + dx, y: cy - 32, w: 38, h: 33 };
}

/**
 * Player name text region (white text, left-aligned; descenders reach
 * cy+18). Long names run into the paint column; parse paint first and trim
 * at the leftmost paint digit. Wide weapon icons can bleed a column or two
 * into the left edge — kept narrower than any observed first glyph.
 */
export function nameRoi(cy: number, dx: number): Roi {
	return { x: 620 + dx, y: cy - 16, w: 226, h: 37 };
}

/**
 * Paint amount digits, LEFT-aligned starting at x~843 (~18px pitch); the
 * trailing "p" moves with the digit count, so 3-digit paints (short
 * knockout games) put it inside this region — parseNumber's digit-only
 * charset drops it on score.
 */
export function paintRoi(cy: number, dx: number): Roi {
	return { x: 821 + dx, y: cy - 15, w: 88, h: 34 };
}

/**
 * Gate anchor over the "p" after the paint number. Because the number is
 * left-aligned, the "p" position tracks the digit count: measured x
 * 898-907 after 3 digits, 915-924 after 4 — the probe spans both.
 */
export function paintSuffixRoi(cy: number, dx: number): Roi {
	return { x: 896 + dx, y: cy - 13, w: 31, h: 26 };
}

/**
 * Stat counter digits (two, zero-padded; the small "x" prefix is excluded).
 * Digits sit at cy+4..cy+23; the stat icons directly above bleed ink into
 * anything higher, so the top edge must stay below them.
 */
export function statRoi(cy: number, dx: number, index: 0 | 1 | 2): Roi {
	const x = [1000, 1057, 1114][index]!;
	return { x: x + dx, y: cy + 3, w: 36, h: 24 };
}

/**
 * POV arrow probe: the smaller replay-browser arrow sits on the pill's left
 * edge (measured x 487-530, y cy-28..cy+17 on the fixture). Right edge stays
 * short of the weapon-icon region (x 522+) core so icon yellows can't leak in.
 */
export function povArrowRoi(cy: number, dx: number): Roi {
	return { x: 480 + dx, y: cy - 32, w: 54, h: 56 };
}

/** Team totals ("440p") on the VICTORY/DEFEAT banner, digits ending x~1119. */
export function teamScoreRoi(dx: number): Roi {
	return { x: 1040 + dx, y: 481, w: 86, h: 36 };
}

/**
 * VICTORY / DEFEAT tag on each panel banner — read to decide which panel
 * won (the replay owner's team may sit on either side).
 */
export function resultTagRoi(dx: number): Roi {
	return { x: 540 + dx, y: 460, w: 220, h: 50 };
}

/** The colored "Score: NN" banners; digits after the constant label. */
export const MATCH_SCORE_ROIS: readonly [Roi, Roi] = [
	{ x: 742, y: 340, w: 130, h: 56 },
	{ x: 1620, y: 340, w: 130, h: 56 },
];

/**
 * Header bands on the stage-photo banner. Line 1 holds the timestamp and
 * the stage tag; line 2 the lobby and mode. Tags are black boxes sized to
 * their text; the replay header parser trims each band to the tag extent.
 */
export const HEADER_TOP_BAND: Roi = { x: 500, y: 68, w: 560, h: 46 };
/**
 * Wide lobby tags push the mode tag right — "Anarchy Battle (Open)" +
 * "Rainmaker" ends at x~1134 — so the band runs well past the longest
 * observed pair; readTagBand trims to the actual tag extent.
 */
export const HEADER_BOTTOM_BAND: Roi = { x: 500, y: 124, w: 700, h: 58 };

/**
 * Bright green replay code line ("XXXX-XXXX-XXXX-XXXX"). Left-aligned after
 * the magnifier icon; the width tracks the glyphs, so a wide-letter code
 * (W/M/G-heavy) runs past x=913 — the box extends into the black background
 * to fit the widest possible code.
 */
export const REPLAY_CODE_ROI: Roi = { x: 574, y: 960, w: 400, h: 38 };

/**
 * Gate probe: flat pill background strip between the paint "p" suffix and
 * the first stat "x" — mid-gray on this screen, not near-black.
 */
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
 * Replay-code color probe: fraction of REPLAY_CODE_ROI pixels that are
 * green-ish (high G, low B) — unique to this screen.
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
