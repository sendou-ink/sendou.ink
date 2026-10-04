/**
 * X Battle card ROIs in canonical 1920x1080 space, calibrated on the
 * fW5h-Ooc-Cg VoD (x-set-count/, x-set-result/, x-rank-position/ fixtures).
 * The lobby draws one near-black card (x≈495-1425, y≈230-850) with the mode
 * icon top-center: the set count after every undecided game, the set result
 * after the deciding one, then the position card, which sits lower, slightly
 * tilted, with a splat badge over its top-right corner. Numbers are BlitzBold
 * (the team-digit atlas, rescaled).
 */
import type { Roi } from "../../canonical";

/** A card's empty interior stays this dark; a fading card lets the backdrop through (30+). */
export const CARD_DARK_MAX_MEAN = 30;
/** The set result's lower "X Power" panel is a lighter grey (~12-19). */
export const PANEL_DARK_MAX_MEAN = 45;

/** Mode icon (~55px) top-center on the set count and set result cards. */
export const CARD_ICON_ROI: Roi = { x: 895, y: 225, w: 130, h: 100 };
/** Max-dimension heights the mode icons are matched at. */
export const MODE_ICON_TEMPLATE_SIZES: readonly number[] = [50, 54, 58, 62];
export const MODE_ICON_MIN_SCORE = 0.5;

/** White numbers on the card binarize cleanly here (the position's yellow digits too, gray ~220). */
export const NUMBER_BIN_THRESHOLD = 150;

// --- set count ("WINS LOSSES / 1 - 2", win splats, loss squids) ---

export const COUNT_DARK_PROBES: readonly Roi[] = [
	{ x: 530, y: 260, w: 150, h: 80 },
	{ x: 1240, y: 260, w: 150, h: 80 },
	{ x: 540, y: 700, w: 150, h: 100 },
	{ x: 1220, y: 700, w: 150, h: 100 },
	// where the set result draws its result tiles
	{ x: 600, y: 440, w: 150, h: 50 },
	{ x: 1150, y: 520, w: 150, h: 100 },
];
/** "WINS" and "LOSSES" labels (localized, so only their ink is checked). */
export const COUNT_LABEL_BAND: Roi = { x: 800, y: 348, w: 360, h: 38 };
export const COUNT_WINS_DIGIT_ROI: Roi = { x: 855, y: 392, w: 90, h: 68 };
export const COUNT_LOSSES_DIGIT_ROI: Roi = { x: 978, y: 392, w: 90, h: 68 };
export const COUNT_DIGIT_HEIGHT = 53;
/** Win slots: a dashed circle until the game is won, then a VICTORY splat. */
export const COUNT_WIN_SLOT_CENTERS_X: readonly number[] = [847, 957, 1068];
export const COUNT_WIN_SLOT_Y = 578;
export const COUNT_WIN_SLOT_HALF = 36;
/** Loss slots: an orange squid until the game is lost, then a grey squid under a white X. */
export const COUNT_LOSS_SLOT_CENTERS_X: readonly number[] = [851, 925, 999];
export const COUNT_LOSS_SLOT_Y = 686;
export const COUNT_LOSS_SLOT_HALF = 26;
export const COUNT_SIGNATURE_ROI: Roi = { x: 780, y: 390, w: 360, h: 340 };

// --- set result ("2 - 3", VICTORY/DEFEAT tiles, X Power and its change) ---

export const RESULT_DARK_PROBES: readonly Roi[] = [
	{ x: 530, y: 260, w: 150, h: 80 },
	{ x: 1240, y: 260, w: 150, h: 80 },
];
export const RESULT_PANEL_PROBES: readonly Roi[] = [
	{ x: 540, y: 700, w: 150, h: 100 },
	{ x: 1220, y: 700, w: 150, h: 100 },
];
export const RESULT_HEADER_ROI: Roi = { x: 840, y: 342, w: 240, h: 72 };
export const RESULT_HEADER_HEIGHT = 52;
/**
 * The result tiles, read in play order. They center on the card, so their
 * place depends on the count (5 games: three over two, 4: two over two, 3:
 * one row midway between those two): each row is found as a band of VICTORY
 * yellow / DEFEAT purple text, each tile as a run of its text columns.
 */
export const RESULT_TILES_ROI: Roi = { x: 640, y: 422, w: 640, h: 104 };
/** Text rows of one band sit closer than this; the two rows' text ~25px apart. */
export const RESULT_TILE_LINE_MAX_GAP = 4;
/** Tile text is ~25px tall; a shorter band is a fragment. */
export const RESULT_TILE_LINE_MIN_HEIGHT = 12;
/** Letters of one word sit closer than this; neighboring tiles' words ~75px apart. */
export const RESULT_TILE_TEXT_MAX_GAP = 30;
/** "DEFEAT" spans ~120px; a narrower run of tile-colored text is a fragment. */
export const RESULT_TILE_TEXT_MIN_WIDTH = 60;
export const RESULT_POWER_ROI: Roi = { x: 745, y: 655, w: 440, h: 105 };
export const RESULT_POWER_HEIGHT = 76;
/** The change's text inside the splat right of the "X Power" label. */
export const RESULT_CHANGE_ROI: Roi = { x: 1235, y: 560, w: 130, h: 42 };
export const RESULT_CHANGE_HEIGHT = 23;
/** The splat behind the change text is light grey; only the text clears this. */
export const RESULT_CHANGE_BIN_THRESHOLD = 200;
export const RESULT_SIGNATURE_ROI: Roi = { x: 640, y: 340, w: 740, h: 420 };

// --- position ("Position / Estimate #259 ↓", Japanese "推定 1位 →") ---

export const POSITION_DARK_PROBES: readonly Roi[] = [
	{ x: 540, y: 700, w: 150, h: 100 },
	{ x: 600, y: 440, w: 150, h: 50 },
	{ x: 1250, y: 620, w: 120, h: 100 },
];
export const POSITION_ICON_ROI: Roi = { x: 890, y: 300, w: 130, h: 100 };
/** The teal "Position" title (localized, so only its color is checked). */
export const POSITION_LABEL_ROI: Roi = { x: 800, y: 425, w: 300, h: 70 };
export const POSITION_LABEL_MIN_FRACTION = 0.05;
/** "#259" in yellow, left of the arrow; starts under the "Estimate" label. */
export const POSITION_NUMBER_ROI: Roi = { x: 640, y: 626, w: 530, h: 118 };
export const POSITION_NUMBER_HEIGHT = 92;
export const POSITION_NUMBER_MIN_FRACTION = 0.05;
/** From the number's tail to the card's right edge: the arrow sits 25-40px after the number, so its x varies with the digit count. */
export const POSITION_ARROW_ROI: Roi = { x: 1000, y: 575, w: 400, h: 185 };
