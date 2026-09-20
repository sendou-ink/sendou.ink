/**
 * Quick battle log ROIs in canonical 1920x1080 space, calibrated against the
 * anarchy-series-clam-blitz-wahoo-world fixture. The lobby's Recent Battles
 * quick view (the menu overlay with the battle list on the left) draws the
 * same stacked panels as the full screen, but as a card in slight
 * perspective: its right side sits nearer the camera, so the row pitch grows
 * from 61px at the pills' left end to 64px at their right and the header
 * tags tilt with it. Frames are rectified through RECTIFY before any ROI
 * applies, so every ROI here is in the rectified frame: level rows on a
 * 62.5px pitch with the row text at the live scoreboard's sizes, the card
 * ~75px left of and ~20px above the full screen's.
 */
import type { Roi } from "../../canonical";
import type { PerspectiveQuad } from "../../rectify";
import type {
	BattleLogRois,
	PanelIndex,
} from "../scoreboard-battle-log/detector";

/**
 * The first pill row's top edge and the last row's bottom edge at two
 * content-free columns (between name and paint, right of the last stat),
 * mapped to their heights at the paint column (x~1280) so the text keeps its
 * size there.
 */
export const RECTIFY: PerspectiveQuad = {
	from: [
		[1240, 408],
		[1605, 406],
		[1240, 995],
		[1605, 1008],
	],
	to: [
		[1240, 408],
		[1605, 408],
		[1240, 996],
		[1605, 996],
	],
};

/** Vertical centers of the 4 player rows within the top panel. */
const ROW_CENTERS = [433, 495, 558, 620] as const;

/** Vertical shift from a top-panel row ROI to its bottom-panel twin. */
const PANEL_DY = 351;

/** dy per panel: [top (index 0), bottom (index 1)]. */
const PANEL_DYS = [0, PANEL_DY] as const;

/** Icons at live-scoreboard sizes; 56px height excludes the larger replay-browser templates. */
function weaponRoi(cy: number): Roi {
	return { x: 950, y: cy - 28, w: 76, h: 56 };
}

/**
 * Special icon above the third stat (~x 1565-1588), read only to break near-tied weapons; bounded
 * at cy to keep digits out.
 */
function specialIconRoi(cy: number): Roi {
	return { x: 1553, y: cy - 26, w: 52, h: 26 };
}

/** Name text from x=1031; long names run into paint, trim at its leftmost digit. */
function nameRoi(cy: number): Roi {
	return { x: 1027, y: cy - 14, w: 200, h: 32 };
}

/** Paint amount digits, right-aligned ending at x=1308 (the "p" suffix is excluded). */
function paintRoi(cy: number): Roi {
	return { x: 1228, y: cy - 16, w: 84, h: 33 };
}

/** The constant white "p" after the paint number (x 1313-1325) — used as a gate anchor. */
function paintSuffixRoi(cy: number): Roi {
	return { x: 1311, y: cy - 14, w: 18, h: 28 };
}

/** Stat counter digits (two, zero-padded; the small "x" prefix is excluded). */
function statRoi(cy: number, index: 0 | 1 | 2): Roi {
	const x = [1443, 1507, 1570][index]!;
	return { x, y: cy + 3, w: 30, h: 20 };
}

/** POV arrow left of the pill (x ~901-944), reaching the pill's rounded cap (~x 940). */
function povArrowRoi(cy: number): Roi {
	return { x: 890, y: cy - 32, w: 56, h: 62 };
}

/**
 * The bottom panel's banner sits lower than its rows would put it: the team
 * total 352px under the top panel's, the result stamp 349px.
 */
const TEAM_SCORE_DYS = [0, 352] as const;
const RESULT_TAG_DYS = [0, 349] as const;

/** Team totals ("500 p") ending x=1617, read only to recognize a knockout (500). */
function teamScoreRoi(panel: PanelIndex): Roi {
	return { x: 1524, y: 352 + TEAM_SCORE_DYS[panel], w: 99, h: 38 };
}

/** VICTORY/DEFEAT tag (team ink on a gray stamp, y 343-390), hugged so the panel ink stays out. */
function resultTagRoi(panel: PanelIndex): Roi {
	return { x: 930, y: 345 + RESULT_TAG_DYS[panel], w: 215, h: 43 };
}

/**
 * "Score:" banner sides: left follows the localized label (x~907), right ends x~1657; a knockout
 * replaces the winner's value.
 */
const MATCH_SCORE_ROIS: readonly [Roi, Roi] = [
	{ x: 905, y: 268, w: 265, h: 40 },
	{ x: 1562, y: 263, w: 100, h: 40 },
];

/**
 * Header bands: timestamp + stage, lobby + mode. Rectified, the tags keep a
 * residual tilt of ~1px per 80px, so the bands hug the text with that slack.
 */
const HEADER_TOP_BAND: Roi = { x: 785, y: 60, w: 640, h: 30 };
const HEADER_BOTTOM_BAND: Roi = { x: 785, y: 108, w: 700, h: 38 };
const HEADER_TAG_LEAD_IN_MAX = 40;
/** see TagBandOptions.tagColumnFraction — the residual tilt lets photo rows into a column */
const HEADER_TAG_COLUMN_FRACTION = 0.75;

/** Strip between paint "p" (ends 1325) and first stat "x" (starts 1435): empty pill background. */
function gateDarkProbe(cy: number): Roi {
	return { x: 1338, y: cy - 10, w: 78, h: 20 };
}

/**
 * Ink-color probes vs lookalikes: the panel bands beside the result stamps and the score banner
 * between its two texts are saturated here (110+).
 */
const GATE_COLOR_PROBES: readonly Roi[] = [
	{ x: 1270, y: 360, w: 100, h: 16 },
	{ x: 1270, y: 712, w: 100, h: 16 },
	{ x: 1300, y: 282, w: 60, h: 14 },
];

/** Mean-RGB saturation (max minus min channel) floor for the color probes. */
const GATE_COLOR_MIN_SATURATION = 60;

/** The strip between p suffix and stats must stay near-black. */
const GATE_DARK_MAX_MEAN = 45;
/** The paint "p" suffix region must contain bright (white) pixels. */
const GATE_TEXT_MIN_MAX = 180;

/** Text metrics measured on the fixture, used for glyph scaling / tooling. */
const MATCH_SCORE_DIGIT_HEIGHT = 27;
const HEADER_TIMESTAMP_HEIGHT = 21;
const HEADER_LINE_HEIGHT = 25;
const RESULT_TAG_TEXT_HEIGHT = 30;

/** This screen's geometry, as the shared battle log parser consumes it. */
export const ROIS: BattleLogRois = {
	RECTIFY,
	ROW_CENTERS,
	PANEL_DYS,
	weaponRoi,
	specialIconRoi,
	nameRoi,
	paintRoi,
	paintSuffixRoi,
	statRoi,
	povArrowRoi,
	teamScoreRoi,
	resultTagRoi,
	MATCH_SCORE_ROIS,
	HEADER_TOP_BAND,
	HEADER_BOTTOM_BAND,
	HEADER_TAG_LEAD_IN_MAX,
	HEADER_TAG_COLUMN_FRACTION,
	gateDarkProbe,
	GATE_COLOR_PROBES,
	GATE_COLOR_MIN_SATURATION,
	GATE_DARK_MAX_MEAN,
	GATE_TEXT_MIN_MAX,
	MATCH_SCORE_DIGIT_HEIGHT,
	HEADER_TIMESTAMP_HEIGHT,
	HEADER_LINE_HEIGHT,
	RESULT_TAG_TEXT_HEIGHT,
};
