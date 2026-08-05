/**
 * ALL death-screen ROI coordinates, in canonical 1920x1080 space.
 * Calibrated against the death/ fixtures via tools/dump-crops.ts,
 * HoughCircles measurement, and bright-row profiling.
 *
 * The death cam overlays three fixed elements on live gameplay:
 * - a dark camo "splat burst" in the top-center with the two-line white
 *   message "Splatted by" / "<weapon name>!";
 * - the killer's gear panel bottom-left: a dark rounded rect with three
 *   gear rows (head/clothes/shoes), each one large main-ability circle
 *   (⌀~68) plus three small sub-ability circles (⌀~48), rows divided by
 *   white dashed lines;
 * - the killer's splash tag bottom-right, tilted a few degrees, with the
 *   name in large type (banner art and text color vary per player).
 * Everything except the tag banner sits over the live scene, so probe
 * regions were chosen inside the opaque-dark parts of the overlays.
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
 * Non-Latin weaponLine=1 languages (JA: "<weapon> で" over "やられた！")
 * read the two lines with swapped widths: the variable-length weapon name
 * sits on line 1, so it gets the full-width box, while the constant line
 * below is short and centered, so a narrow box keeps scene ink that shows
 * past the burst's edge out of the read. Both boxes are taller than the
 * Latin ones: kana overshoot the Latin cap band on both sides (dakuten
 * above, full-depth bodies below — the JP line spans y=359..401 where the
 * Latin crop starts at 362).
 */
export const JA_WEAPON_LINE_ROI: Roi = { x: 640, y: 354, w: 640, h: 62 };
export const JA_CONST_LINE_ROI: Roi = { x: 790, y: 412, w: 340, h: 54 };

/**
 * The killer's weapon icon, drawn upright at the top of the burst above the
 * message text (main-weapon 2D icon art, ~110px; specials appear team-color
 * tinted instead and are not matched). Templates competing in this box are
 * built at BURST_ICON_TEMPLATE_SIZES — score peaks vary 124-132 per capture,
 * so several sizes are tried. When a "Lost the Rainmaker!" style line is
 * present the icon shifts up out of this box; the text read handles those.
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

/**
 * Search boxes around each circle. Heights double as the size filter:
 * matchTemplate silently skips templates taller than the ROI, so the
 * 56px sub box excludes the main-size templates.
 */
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

/**
 * Icon art diameter as a fraction of the circle box (art-ratio sweep over
 * the fixtures: mains peak at 1.0, subs at 0.92 — the badges draw the art
 * nearly edge-to-edge, so the template sizes above are effectively the art
 * sizes and the black ring contributes almost nothing).
 */
export const ABILITY_MAIN_ART_RATIO = 1.0;
export const ABILITY_SUB_ART_RATIO = 0.92;

/**
 * Ink threshold inside a circle box: the badge is near-black, icon art is
 * saturated-bright. The panel is slightly translucent, so a bright scene
 * can ghost through at low intensity — kept above that.
 */
export const ABILITY_INK_THRESHOLD = 90;

/**
 * A gear row only carries as many sub circles as the gear has slots
 * (1-3, left-aligned); an absent slot shows the bare translucent panel.
 * Bright pixels (max channel > ABILITY_INK_THRESHOLD) inside the sub box
 * separate the cases cleanly: absent slots measure 0 across the fixtures
 * while every real badge — ability art or the white "?" of an unrevealed
 * slot, down to the dimmest 720p capture — measures 403+.
 */
export const ABILITY_SLOT_MIN_INK = 200;

/**
 * Splash tag name band. The tag renders tilted (text baseline rises to the
 * right by TAG_TILT_DEG); crop TAG_NAME_OUTER, rotate level around its
 * center, then read TAG_NAME_INNER relative to the rotated crop.
 */
export const TAG_TILT_DEG = 3.0;
export const TAG_NAME_OUTER: Roi = { x: 1130, y: 770, w: 650, h: 140 };
/**
 * Name band inside the rotated outer crop. The top edge must clear the
 * kana dakuten, which rise well past the cap band (ご's marks start at
 * outer y=24; the old y=34 top clipped them, and the surviving sliver
 * touched the band border, where clearBorderBlobs deleted it — reading こ
 * for ご). The title line above ends by outer y=17 (descenders included),
 * so y=21 splits the two with margin on both sides.
 */
export const TAG_NAME_INNER: Roi = { x: 20, y: 21, w: 610, h: 87 };

/** Tight cap height of the tag name text (atlas nominal height). */
export const TAG_NAME_TEXT_HEIGHT = 46;

/**
 * Gate probes. The burst camo is dark (~25-70) left/right of the constant
 * text line and below the weapon line; the gear panel is dark in the strip
 * right of the sub circles. The white message text gives the bright anchor.
 */
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
 * The dark probes plus a white text line also describe the scoreboard
 * screens, so the gate additionally requires bright icon art at all three
 * main-ability circle centers. Brightness is the per-pixel max RGB channel,
 * not grayscale: saturated ability art can be gray-dark everywhere in the
 * circle (z-f-splatterscope-vod's middle-row orange/purple flame peaks at
 * 134 in gray but 248 in max-channel). Death fixtures measure 244+ in
 * max-channel while the closest non-death fixture row is 184.
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
