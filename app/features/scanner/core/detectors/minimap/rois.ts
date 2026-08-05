/**
 * ALL minimap ROI coordinates, in canonical 1920x1080 space. Calibrated
 * against the minimap/ fixtures via tools/dump-crops.ts crops plus template
 * relocation sweeps (each card's ability badges sit on an exact 48px pitch,
 * which pins the grid origins).
 *
 * The in-match map overlay (opened with X) draws over gaussian-blurred live
 * gameplay:
 * - four own-team callout cards: three teammates at fixed super-jump slots
 *   (d-pad up = top-center, left = mid-left, right = mid-right) and the POV
 *   player's own card bottom-left (no d-pad). Each carries the player name
 *   (BlitzMain, ~29px caps), the main weapon as full-color icon art on the
 *   translucent dark card, team-tinted sub/special tiles, and three
 *   main-ability badges (⌀~44). A respawning player's card is struck
 *   through with a large team-color X whose arms cross at the card center;
 * - the enemy panel top-right: four rows of full-color weapon icon art,
 *   sub/special tiles, and the same three ability badges — no names. A
 *   respawning enemy's row is struck through (the X spares the weapon icon
 *   at the row's left edge);
 * - special ready: a card/row whose player has a charged special swaps its
 *   dark background for a light gray-green camo pattern (~150 mean, low
 *   saturation), same geometry, inverted contrast around the weapon art;
 * - constant chrome: the close-button disc top-left (dark disc, white X)
 *   and the Spawn Point pill bottom-center. The pill label is localized,
 *   so the gate reads shapes (disc, strokes, the white jump-arrows icon),
 *   never text.
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
	/**
	 * cross-out probe at the card center (where the X's arms meet): white
	 * name glyphs and the dark pill are unsaturated, the X core is not
	 */
	cross: Roi;
}

/**
 * The right card is the left card's layout shifted +1352px (verified on the
 * struck-through fixture card only — re-derive from an uncrossed right-slot
 * fixture when one lands). The self card differs: avatar leftmost, larger
 * left inset for the name, no d-pad.
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
/**
 * The row's X arms meet in the dark gap between the special tile and the
 * first badge; on a clean row the gap stays unsaturated.
 */
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
 * Badge ink threshold: badge circles are near-black; the enemy panel's
 * translucent pink bleeds into the box corners at ~150-180, a constant
 * penalty across candidates that leaves the ranking intact.
 */
export const MINIMAP_ABILITY_INK_THRESHOLD = 90;

/** BlitzMain caps measure 28-29px on every card (self included). */
export const NAME_TEXT_HEIGHT = 29;
export const NAME_BIN_THRESHOLD = 170;

/**
 * Cross-out probe: fraction of saturated-and-bright pixels (HSV, 0..255
 * channels). Struck cards measure 0.26-0.38, clean ones <= 0.01.
 */
export const CROSS_SATURATION_MIN = 110;
export const CROSS_VALUE_MIN = 110;
export const CROSS_MIN_FRACTION = 0.08;

/**
 * Weapon template variants (template prep in scoreboard/weapons.ts): cards
 * and enemy rows both draw full-color icon art. Both minimap sets are built
 * with cropToArt — the game renders the icon at the equivalent of a
 * ~44-60px padded square, and the 54px-tall card box can only host the
 * larger sizes once the transparent padding is trimmed (the Splatana
 * Stamper on the special-ready fixture card is unmatchable without it).
 * Dark surfaces (translucent card/row over the blurred scene, measured
 * ~15-90) match against a bg-40 composite; special-ready camo surfaces
 * (~150 mean) against a bg-150 composite — each with an ink threshold
 * clearing its background.
 */
/**
 * Sub-weapon silhouette heights for the ~39x40 sub tiles (art renders
 * ~26-34px inside the dark plate). Matched shape-only (specials.ts), which
 * survives the team tint, the camo surround, and even a cross-out stroke
 * clipping the tile — used only to split near-tied main-weapon icons whose
 * kits carry different subs (plain vs Custom Dualie Squelchers).
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
 * Weapon-box corner mean above this = special-ready camo background. Probes
 * take the MIN of the two top corners: camo corners measure 140-165 on both,
 * while a dark card keeps at least one corner <=90 even when avatar bleed or
 * a cross-out stroke brightens the other.
 */
export const SPECIAL_READY_MIN_CORNER_MEAN = 120;
/**
 * Weapon score floors: camo surfaces score systematically lower (the blob
 * pattern behind the art depresses NCC) — 0.45-0.61 on correct matches vs
 * 0.77+ on dark surfaces.
 */
export const WEAPON_MIN_SCORE = 0.55;
export const SPECIAL_READY_WEAPON_MIN_SCORE = 0.42;

/**
 * Card/row presence: the overlay is crisp while the scene behind it is
 * gaussian-blurred, so mean |Laplacian| over the name band (cards) or the
 * weapon box (enemy rows) separates a drawn element from see-through
 * background regardless of what the blur happens to show.
 */
export const PRESENCE_MIN_LAPLACIAN = 8;

/**
 * Gate probes (overlay variant): close-button disc + Spawn Point pill
 * shapes. The close button is a white ✕ glyph on a dark disc (center
 * (110,92), ±4px across fixtures), traced like the spectator X: bright
 * probes on the crossing point and the four stroke arms, dark probes in
 * the cardinal gaps between them. A mere bright blob at the same spot —
 * the results screen's splat counter puts white digits exactly there —
 * lights the gaps or misses the arms and fails.
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
 * Spectator-variant gate: casted streams show the map as the 8-player
 * spectator screen (all eight players carded left/right, A/B/Y/X jump
 * buttons) instead of the POV overlay, and stream layouts routinely cover
 * the overlay gate's corner chrome (close disc behind the branding
 * top-left, spawn-pill area behind the bottom bar). The X jump-button disc
 * beside the 8th player card (bottom-right) is rarely covered, so this
 * variant gates there: bright probes trace the X glyph itself (crossing
 * point plus the four stroke arms), dark probes sit in the disc's gaps at
 * the glyph's cardinal edges — a solid white blob or a non-X glyph at the
 * same spot lights the gaps and fails. Disc center (1424,712), aligned
 * within ±4px across the attested stream layouts; the 12x12/8x8 probe
 * boxes absorb that jitter. Measured margins: spectator frames read
 * bright>=249 / dark<=65 against the shared 210/85 thresholds.
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
 * Spectator screen card grid: four cards per column on a 120px row pitch,
 * the right column the left one shifted +1348px (same relation as the
 * overlay's right card, verified within ±4px across the attested stream
 * layouts). The left column carries the alpha team — its cards show a
 * d-pad glyph highlighting up/right/down/left, reported as the teammate
 * slot — and the right column the bravo team (reported as enemy rows,
 * though this screen does show their names). Each card: name line above
 * (BlitzMain, same 29-30px caps as the overlay cards), then weapon icon
 * art, sub + special tiles, and three ability badges on the overlay's
 * 48px pitch. The cross-out probe sits in the dark gap between the
 * special tile and the first badge (like the overlay enemy rows); no
 * struck-through or special-ready spectator fixture is attested yet, so
 * those probes reuse the overlay thresholds untuned.
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
 * Spectator name reads are tried at both heights and the more confident
 * read wins: the JPEG/upscale blur across stream captures moves the best
 * fit between 29 and 30 per card (measured 0.85-0.93 at the winning
 * height, with the loser dropping glyphs' dakuten or bar lengths).
 */
export const SPECTATOR_NAME_TEXT_HEIGHTS = [29, 30] as const;
