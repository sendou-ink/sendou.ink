/**
 * ALL minimap ROI coordinates, in canonical 1920x1080 space. Calibrated
 * against the minimap/ fixtures via tools/dump-crops.ts plus template
 * relocation sweeps (badges sit on an exact 48px pitch, pinning origins).
 *
 * The in-match map overlay (X) draws over gaussian-blurred gameplay: four
 * own-team cards (POV player bottom-left) and an enemy panel top-right,
 * each with weapon icon art, sub/special tiles, three ability badges
 * (⌀~44); a respawning player is struck through with a team-color X, and
 * a charged special swaps the card background for gray-green camo.
 * Constant chrome (close disc, Spawn Point pill) gates on shape since the
 * pill label is localized.
 */
import type { Roi } from "../../canonical";

/** "self" and "down" never coexist: the POV overlay has no down slot (the
 * player's own card replaces it), the spectator grid has no self card. */
export type CardSlot = "up" | "left" | "right" | "self" | "down";

export interface CardLayout {
	slot: CardSlot;
	/** name text band (BlitzMain caps ~29px plus outline/descender margin) */
	name: Roi;
	/** main-weapon silhouette box (icons render ~31-48px tall) */
	weapon: Roi;
	/** sub-weapon tile: saturated team-color art, the ink-color anchor */
	subTile: Roi;
	/** the three main-ability badge centers, 48px pitch */
	badges: readonly (readonly [number, number])[];
	/** cross-out probe at card center: name/pill are unsaturated, X core isn't */
	cross: Roi;
}

/**
 * Right card = left shifted +1352px (verified only on the struck fixture).
 * Self card differs: avatar leftmost, larger name inset, no d-pad.
 */
export const CARD_LAYOUTS: readonly CardLayout[] = [
	{
		slot: "up",
		name: { x: 872, y: 46, w: 300, h: 44 },
		weapon: { x: 860, y: 83, w: 84, h: 54 },
		subTile: { x: 932, y: 98, w: 38, h: 41 },
		badges: [
			[1066, 114],
			[1114, 114],
			[1162, 114],
		],
		cross: { x: 925, y: 78, w: 60, h: 32 },
	},
	{
		slot: "left",
		name: { x: 198, y: 492, w: 300, h: 44 },
		weapon: { x: 193, y: 529, w: 84, h: 54 },
		subTile: { x: 265, y: 544, w: 38, h: 41 },
		badges: [
			[392, 564],
			[440, 564],
			[488, 564],
		],
		cross: { x: 258, y: 524, w: 60, h: 32 },
	},
	{
		slot: "right",
		name: { x: 1550, y: 492, w: 300, h: 44 },
		weapon: { x: 1545, y: 529, w: 84, h: 54 },
		subTile: { x: 1617, y: 544, w: 38, h: 41 },
		badges: [
			[1744, 564],
			[1792, 564],
			[1840, 564],
		],
		cross: { x: 1610, y: 524, w: 60, h: 32 },
	},
	{
		slot: "self",
		name: { x: 126, y: 942, w: 300, h: 46 },
		weapon: { x: 118, y: 985, w: 94, h: 55 },
		subTile: { x: 193, y: 995, w: 38, h: 36 },
		badges: [
			[320, 1014],
			[368, 1014],
			[416, 1014],
		],
		cross: { x: 255, y: 968, w: 60, h: 32 },
	},
];

/** Enemy panel row centers (65px pitch) and per-row element boxes. */
export const ENEMY_ROW_CYS = [82, 147, 213, 278] as const;

export function enemyWeaponRoi(cy: number): Roi {
	return { x: 1541, y: cy - 26, w: 58, h: 52 };
}
export function enemySubTileRoi(cy: number): Roi {
	return { x: 1602, y: cy - 20, w: 39, h: 40 };
}
export const ENEMY_BADGE_XS = [1730, 1778, 1826] as const;
/** X arms meet in the dark gap between special tile and first badge (unsaturated when clean). */
export function enemyCrossRoi(cy: number): Roi {
	return { x: 1685, y: cy - 12, w: 28, h: 24 };
}

/** Badge search box (badges ⌀~44; the box height keeps larger sets out). */
export function badgeRoi(cx: number, cy: number): Roi {
	return { x: cx - 26, y: cy - 26, w: 52, h: 52 };
}
export const BADGE_TEMPLATE_SIZES = [38, 42, 46] as const;
/** Badge art fills the circle like the death panel's mains. */
export const BADGE_ART_RATIO = 1.0;
/**
 * Badge ink threshold: near-black circles vs the enemy panel's translucent
 * pink bleed (~150-180 in corners) — a constant penalty, ranking intact.
 */
export const MINIMAP_ABILITY_INK_THRESHOLD = 90;

/** BlitzMain caps measure 28-29px on every card (self included). */
export const NAME_TEXT_HEIGHT = 29;
export const NAME_BIN_THRESHOLD = 170;

/** Cross-out probe: fraction of saturated+bright HSV pixels. Struck 0.26-0.38, clean <=0.01. */
export const CROSS_SATURATION_MIN = 110;
export const CROSS_VALUE_MIN = 110;
export const CROSS_MIN_FRACTION = 0.08;
/**
 * A saturated probe alone is not a cross-out: the fully-rendered POV map
 * screen draws bright team ink through the translucent cards/panel
 * (attested phantom fractions 0.61-0.65 on the Um'ami fixture with
 * everyone alive). The X stroke is crisp UI while the bleed is softened by
 * the surface — mean |Laplacian| over the probe separates them (struck
 * >=98 vs bleed <=34; the floor only gates the fraction, clean cards read
 * up to ~62 of crisp line art at fraction ~0).
 */
export const CROSS_MIN_LAPLACIAN = 65;

/**
 * Weapon templates built with cropToArt (54px card box needs padding
 * trimmed to fit larger icons — Splatana Stamper unmatchable otherwise).
 * Dark surfaces match a bg-40 composite, special-ready camo a bg-150 one.
 */
/**
 * Sub-tile silhouettes matched shape-only (specials.ts): survives team
 * tint/camo/cross-out, used to split near-tied main-weapon icons.
 */
export const SUB_TILE_TEMPLATE_SIZES = [24, 27, 30, 33, 36] as const;

export const CARD_WEAPON_BACKGROUND = 40;
export const SPECIAL_READY_BACKGROUND = 150;
export const MINIMAP_WEAPON_TEMPLATE_SIZES = [
	40, 44, 48, 52, 56, 60, 64,
] as const;
export const MINIMAP_WEAPON_INK_THRESHOLD = CARD_WEAPON_BACKGROUND + 50;
export const SPECIAL_READY_INK_THRESHOLD = SPECIAL_READY_BACKGROUND + 50;
/**
 * Corner mean above this = special-ready camo (measures 140-165); a dark
 * card keeps at least one top corner <=90 despite avatar/cross-out bleed.
 * The fully-rendered POV map screen can push a clean card's corners past
 * the mean floor (attested 136.7 on the Um'ami fixture vs true camo
 * >=139.9), so the camo call also requires the dimmer corner to be
 * unsaturated like the gray-green camo — attested camo <=53 vs bright
 * scene bleed >=67 (the dimmer corner, because a cross-out stroke can
 * saturate the brighter one on a struck camo row). Margins are THIN on
 * both probes — re-measure before moving either.
 */
export const SPECIAL_READY_MIN_CORNER_MEAN = 120;
export const SPECIAL_READY_MAX_CORNER_SATURATION = 60;
/**
 * Camo surfaces score systematically lower (blob pattern depresses NCC):
 * 0.45-0.61 on correct matches vs 0.77+ on dark surfaces.
 */
export const WEAPON_MIN_SCORE = 0.55;
export const SPECIAL_READY_WEAPON_MIN_SCORE = 0.42;

/**
 * A non-camo card whose dimmer corner still reads this bright sits on
 * scene bleed (the fully-rendered POV map screen lights the translucent
 * surfaces to ~95-137): neither composite matches such a surface exactly,
 * so both template sets are tried and the better score wins, under the
 * camo floor — bleed depresses NCC the same way (attested true matches
 * 0.55-0.66 there, and the E-liter card wins as the light set's 0.611
 * over the dark set's misranked 0.599 — THIN, re-measure before touching).
 * Dark cards (corners <=77 attested) keep the plain dark match.
 */
export const WEAPON_BLEED_MIN_CORNER_MEAN = 90;

/**
 * Overlay is crisp over a blurred scene: mean |Laplacian| over the name
 * band/weapon box separates a drawn element from see-through background.
 */
export const PRESENCE_MIN_LAPLACIAN = 8;

/**
 * Close-button gate: white ✕ on a dark disc (center (110,92) ±4px). Bright
 * probes trace the crossing point + four arms, dark probes sit in the
 * cardinal gaps — a plain bright blob misses the arms and fails.
 */
export const GATE_CLOSE_X_BRIGHT: readonly Roi[] = [
	{ x: 104, y: 88, w: 12, h: 10 },
	{ x: 88, y: 72, w: 8, h: 10 },
	{ x: 124, y: 72, w: 8, h: 10 },
	{ x: 88, y: 108, w: 8, h: 10 },
	{ x: 124, y: 108, w: 8, h: 10 },
];
export const GATE_CLOSE_X_DARK: readonly Roi[] = [
	{ x: 104, y: 62, w: 12, h: 8 },
	{ x: 104, y: 116, w: 12, h: 8 },
	{ x: 76, y: 88, w: 8, h: 10 },
	{ x: 136, y: 88, w: 8, h: 10 },
];
/** Dark ring/background just outside the close-button disc. */
export const GATE_CLOSE_DARK_PROBES: readonly Roi[] = [
	{ x: 88, y: 50, w: 20, h: 14 },
	{ x: 88, y: 132, w: 20, h: 14 },
	{ x: 58, y: 88, w: 14, h: 20 },
	{ x: 132, y: 88, w: 14, h: 20 },
];
/** The white jump-arrows icon left of the (localized) pill label. */
export const GATE_SPAWN_BRIGHT: Roi = { x: 888, y: 963, w: 60, h: 60 };
export const GATE_SPAWN_DARK_PROBES: readonly Roi[] = [
	{ x: 812, y: 958, w: 26, h: 14 },
	{ x: 950, y: 1024, w: 60, h: 12 },
];
export const GATE_DARK_MAX_MEAN = 85;
export const GATE_BRIGHT_MIN_MAX = 210;

/**
 * Spectator-variant gate: casted streams show the 8-player spectator
 * screen and often cover the overlay gate's corner chrome, so this gates
 * on the rarely-covered X jump-button disc beside the 8th card
 * (bottom-right, center (1424,712) ±4px). Measured margins: bright>=249 /
 * dark<=65 against the shared 210/85 thresholds.
 */
export const GATE_SPECTATOR_X_BRIGHT: readonly Roi[] = [
	{ x: 1418, y: 706, w: 12, h: 12 },
	{ x: 1411, y: 692, w: 12, h: 12 },
	{ x: 1425, y: 692, w: 12, h: 12 },
	{ x: 1411, y: 720, w: 12, h: 12 },
	{ x: 1425, y: 720, w: 12, h: 12 },
];
export const GATE_SPECTATOR_X_DARK: readonly Roi[] = [
	{ x: 1399, y: 708, w: 8, h: 8 },
	{ x: 1441, y: 708, w: 8, h: 8 },
	{ x: 1420, y: 682, w: 8, h: 8 },
	{ x: 1420, y: 734, w: 8, h: 8 },
];

/**
 * Spectator card grid: four cards per column, 120px row pitch, right =
 * left +1348px. Left column is alpha team, right is bravo (reported as
 * enemy rows). Mirrors the overlay's card layout; no struck/special-ready
 * fixture attested yet, so those probes reuse overlay thresholds untuned.
 */
export const SPECTATOR_SLOTS: readonly CardSlot[] = [
	"up",
	"right",
	"down",
	"left",
];
export const SPECTATOR_ENEMY_DX = 1348;
const SPECTATOR_ROW_PITCH = 120;

export function spectatorCardLayout(
	row: number,
	dx: number,
): Omit<CardLayout, "slot"> {
	const dy = SPECTATOR_ROW_PITCH * row;
	return {
		name: { x: 198 + dx, y: 306 + dy, w: 310, h: 44 },
		weapon: { x: 196 + dx, y: 350 + dy, w: 66, h: 54 },
		subTile: { x: 264 + dx, y: 354 + dy, w: 38, h: 42 },
		badges: [
			[390 + dx, 374 + dy],
			[438 + dx, 374 + dy],
			[486 + dx, 374 + dy],
		],
		cross: { x: 344 + dx, y: 362 + dy, w: 20, h: 24 },
	};
}

/**
 * Spectator names tried at both heights, more confident read wins: blur
 * across captures moves the best fit between 29 and 30 per card.
 */
export const SPECTATOR_NAME_TEXT_HEIGHTS = [29, 30] as const;
