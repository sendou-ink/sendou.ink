/**
 * Death-screen ROIs in canonical 1920x1080 space, calibrated against the death/
 * fixtures (scripts/scanner/dump-crops.ts, HoughCircles, bright-row profiling).
 * The overlay has three fixed elements over live gameplay: the dark camo splat
 * burst top-center (two-line message), the killer's gear panel bottom-left
 * (3 rows: main circle ⌀~68 + three sub circles ⌀~48) and the tilted splash tag
 * bottom-right. Probes sit in the overlays' opaque-dark parts.
 */
import type { Roi } from "../../canonical";

/** The constant "Splatted by" line (white text centered at x=960). */
export const SPLAT_LINE1_ROI: Roi = { x: 790, y: 362, w: 340, h: 52 };

/** The weapon name line ("Rapid Blaster Deco!"), centered, length varies. */
export const WEAPON_LINE_ROI: Roi = { x: 640, y: 414, w: 640, h: 48 };

/** White message text on the dark burst binarizes cleanly and high. */
export const SPLAT_TEXT_BIN_THRESHOLD = 190;

/** Tight cap height of the message text (atlas nominal height). */
export const WEAPON_TEXT_HEIGHT = 34;

/**
 * weaponLine=1 langs (JA: "<weapon> で" / "やられた！") swap line widths; boxes
 * run taller than Latin since kana overshoot the cap band (JP y=359..401 vs 362).
 */
export const JA_WEAPON_LINE_ROI: Roi = { x: 640, y: 354, w: 640, h: 62 };
export const JA_CONST_LINE_ROI: Roi = { x: 790, y: 412, w: 340, h: 54 };

/**
 * Killer's weapon icon above the message (~110px art; specials render
 * team-tinted, unmatched). A "Lost the Rainmaker!" line shifts it out of the box.
 */
export const BURST_ICON_ROI: Roi = { x: 785, y: 230, w: 190, h: 140 };
export const BURST_ICON_TEMPLATE_SIZES = [116, 124, 132] as const;

/** Gear panel rows: [head, clothes, shoes]. */
export const ABILITY_ROWS = 3;
/** Main-ability circle centers (⌀~68). */
const ABILITY_MAIN_X = 515;
const ABILITY_MAIN_YS = [696, 795, 887] as const;
/** Sub-ability circle centers (⌀~48), slightly below the main's center. */
export const ABILITY_SUB_XS = [578, 630, 682] as const;
const ABILITY_SUB_YS = [702, 797, 888] as const;

/** Search boxes around each circle; heights double as the size filter (matchTemplate skips taller templates). */
export function abilityMainRoi(row: number): Roi {
	const cy = ABILITY_MAIN_YS[row]!;
	return { x: ABILITY_MAIN_X - 38, y: cy - 38, w: 76, h: 76 };
}

export function abilitySubRoi(row: number, slot: number): Roi {
	const cx = ABILITY_SUB_XS[slot]!;
	const cy = ABILITY_SUB_YS[row]!;
	return { x: cx - 28, y: cy - 28, w: 56, h: 56 };
}

/** Template heights (px at 1080p) per circle role. */
export const ABILITY_MAIN_SIZES = [64, 68, 72] as const;
export const ABILITY_SUB_SIZES = [44, 48, 52] as const;

/** Icon art diameter as fraction of the circle box; badges draw art nearly edge-to-edge. */
export const ABILITY_MAIN_ART_RATIO = 1.0;
export const ABILITY_SUB_ART_RATIO = 0.92;

/** Badge near-black, art bright; kept above what a bright scene ghosts through the translucent panel. */
export const ABILITY_INK_THRESHOLD = 90;

/**
 * Rows carry 1-3 sub circles; absent slots show bare panel. Bright pixel count
 * (max channel > ABILITY_INK_THRESHOLD): absent = 0, real badge 403+ even at dim 720p.
 */
export const ABILITY_SLOT_MIN_INK = 200;

/** Splash tag: crop TAG_NAME_OUTER, rotate level by TAG_TILT_DEG, read TAG_NAME_INNER in the rotated crop. */
export const TAG_TILT_DEG = 3.0;
export const TAG_NAME_OUTER: Roi = { x: 1130, y: 770, w: 650, h: 140 };
/**
 * Top edge must clear kana dakuten (y=34 clipped them, misreading こ for ご) yet stay below the title
 * line (ends y=17).
 */
export const TAG_NAME_INNER: Roi = { x: 20, y: 21, w: 610, h: 87 };

/** Tight cap height of the tag name text (atlas nominal height). */
export const TAG_NAME_TEXT_HEIGHT = 46;

/** Gate probes: burst camo dark around the text lines; gear panel dark right of the sub circles. */
export const GATE_BURST_PROBES: readonly Roi[] = [
	{ x: 750, y: 376, w: 36, h: 22 },
	{ x: 1134, y: 376, w: 36, h: 22 },
	{ x: 930, y: 466, w: 60, h: 18 },
];
export const GATE_PANEL_PROBES: readonly Roi[] = [
	{ x: 720, y: 686, w: 30, h: 20 },
	{ x: 720, y: 785, w: 30, h: 20 },
];
export const GATE_DARK_MAX_MEAN = 95;
/** SPLAT_LINE1_ROI must contain near-white pixels... */
export const GATE_TEXT_MIN_MAX = 210;
/** ...but not too many: it is a short text line, not a white panel. */
export const GATE_TEXT_MAX_FRACTION = 0.35;

/**
 * Dark probes + white text also match scoreboards, so the gate also needs bright
 * art at all three main-ability centers (max RGB channel, not grayscale: saturated
 * art can be gray-dark). Death fixtures 244+, closest non-death 184.
 */
export function gateAbilityProbe(row: number): Roi {
	return {
		x: ABILITY_MAIN_X - 14,
		y: ABILITY_MAIN_YS[row]! - 14,
		w: 28,
		h: 28,
	};
}
export const GATE_ICON_MIN_MAX = 200;
