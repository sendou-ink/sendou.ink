/**
 * ALL scoreboard-own ROI coordinates, in canonical 1920x1080 space.
 * Calibrated against scoreboard-own/private-battle-splat-zones-museum via
 * tools/dump-crops.ts and column/row projection measurement.
 *
 * The personal results screen ("your results" after a match) shows the
 * same lobby/mode/stage header tags as the live scoreboard — at the same
 * positions, so header parsing reuses the scoreboard bands — over a large
 * dark panel (~35) with the player's own banner, the medals list, and a
 * bottom row of four cards: the weapon card (yellow-bordered title tag
 * with the weapon name, big render on a white square), then one gear card
 * per slot [head, clothes, shoes], each with a light-gray ability strip of
 * one main badge (⌀~49) and three sub badges (⌀~38).
 */
import type { Roi } from "../../canonical";

/**
 * Weapon card title tag interior (black, fixed width, white weapon name
 * left-aligned). The band starts inside the tag so readTagBand's extent
 * trim anchors on tag columns immediately.
 */
export const WEAPON_TITLE_BAND: Roi = { x: 876, y: 766, w: 200, h: 32 };
/** Tight cap height of the title text at 1080p. */
export const WEAPON_TITLE_TEXT_HEIGHT = 18;
/** White-core title text on the black tag binarizes high, like the burst text. */
export const WEAPON_TITLE_BIN_THRESHOLD = 190;

/** Gear cards [head, clothes, shoes]: main-ability badge center x per row. */
export const GEAR_MAIN_CXS = [1142, 1372, 1602] as const;
/** Sub badge center x offsets from the row's main badge center. */
const GEAR_SUB_DXS = [48, 88, 127] as const;
/** All badges share one vertical center (the ability strip line). */
export const GEAR_BADGE_CY = 927;
export const GEAR_ROWS = 3;

/**
 * Search boxes around each badge. Heights double as the size filter:
 * matchTemplate silently skips templates taller than the ROI, so the 52px
 * sub box excludes the main-size templates within a shared template list.
 */
export function gearMainRoi(row: number): Roi {
	const cx = GEAR_MAIN_CXS[row]!;
	return { x: cx - 32, y: GEAR_BADGE_CY - 32, w: 64, h: 64 };
}

export function gearSubRoi(row: number, slot: number): Roi {
	const cx = GEAR_MAIN_CXS[row]! + GEAR_SUB_DXS[slot]!;
	return { x: cx - 26, y: GEAR_BADGE_CY - 26, w: 52, h: 52 };
}

/** Template heights (px at 1080p) per badge role (main ⌀~49, sub ⌀~38). */
export const OWN_ABILITY_MAIN_SIZES = [45, 49, 53] as const;
export const OWN_ABILITY_SUB_SIZES = [34, 38, 42] as const;
/**
 * Icon art diameter as a fraction of the badge box: the ratio sweep peaks
 * at 1.0 for both roles — the art overflows the circle slightly (arrows
 * poke past the ring), so the badge ring contributes nothing.
 */
export const OWN_ABILITY_ART_RATIO = 1.0;
/**
 * Ink threshold inside a badge box. Unlike the death panel these badges sit
 * on a light-gray strip (~140-155); 170 keeps the strip out of the ink
 * count while the saturated icon art still clears it on its max channel.
 */
export const OWN_ABILITY_INK_THRESHOLD = 170;

/**
 * Gate probes. The results panel is uniform dark (~35, bottom edge ~54)
 * at spots that dodge the banner, medals and cards; each card's title tag
 * holds bright white name text starting at its left edge; the ability
 * strip's gray shows in the constant gap after the third sub badge.
 */
export const GATE_PANEL_PROBES: readonly Roi[] = [
	{ x: 860, y: 245, w: 30, h: 20 },
	{ x: 1690, y: 395, w: 30, h: 20 },
	{ x: 875, y: 695, w: 30, h: 20 },
	{ x: 1400, y: 985, w: 30, h: 20 },
];
export const GATE_PANEL_MAX_MEAN = 65;

/** Left edge of each card's title text (weapon card first). */
export const GATE_TITLE_TEXT_PROBES: readonly Roi[] = [
	{ x: 880, y: 768, w: 70, h: 26 },
	{ x: 1090, y: 768, w: 70, h: 26 },
	{ x: 1319, y: 768, w: 70, h: 26 },
	{ x: 1550, y: 768, w: 70, h: 26 },
];
/** Title text regions must contain bright (white) pixels. */
export const GATE_TEXT_MIN_MAX = 180;

/** Gray ability-strip gap after the third sub badge, one per gear card. */
export function gateStripProbe(row: number): Roi {
	return { x: GEAR_MAIN_CXS[row]! + 148, y: 917, w: 10, h: 18 };
}
export const GATE_STRIP_MIN_MEAN = 110;
export const GATE_STRIP_MAX_MEAN = 200;
