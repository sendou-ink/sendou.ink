/**
 * Judd results screen ROIs in canonical 1920x1080 space, calibrated against
 * the judd-flag/ fixtures (SWS and IPL casts). The results band runs across the
 * bottom (x≈60-1860): its top edge waves around y≈835-880 under a dark rim,
 * the score text sits in its upper half (y≈870-935) and the points under it
 * at the far ends, which leaves rows y≈940-995 plain ink everywhere but the
 * corners. A cast's lower thirds and a streamer's boxes cover its ends.
 */

/** Columns sampled across the band, every `BAND_COLUMN_STEP` px from the first to the last. */
export const BAND_FIRST_COLUMN = 96;
export const BAND_LAST_COLUMN = 1824;
export const BAND_COLUMN_STEP = 16;

/** Rows of the band below its text, sampled every `BAND_CORE_ROW_STEP` px: plain ink in every column the band shows. */
export const BAND_CORE_TOP = 940;
export const BAND_CORE_BOTTOM = 996;
export const BAND_CORE_ROW_STEP = 3;

/** A band column's top edge, scanning up from the core, lies between these: above it a gameplay floor of one ink runs on. */
export const BAND_TOP_MIN_Y = 826;
export const BAND_TOP_MAX_Y = 890;
/** How far up the top edge is looked for, just past `BAND_TOP_MIN_Y`. */
export const BAND_TOP_SCAN_Y = 812;
/** Rows of something else that end the scan up: a dark rim or the map above, not a stray pixel of the score text's edge. */
export const BAND_TOP_END_ROWS = 3;
export const BAND_TOP_SCAN_STEP = 2;

/** The middle of the band, which no text, overlay or Judd covers. */
export const BAND_MIDDLE_LEFT = 700;
export const BAND_MIDDLE_RIGHT = 1220;

/**
 * A core column is plain ink: channel spread over its max at least this (the band's ink 0.65+ on the fixtures, a
 * stage's pale water 0.38+), max at least `BAND_INK_MIN_VALUE` (the band's ink is lit full, 163+, a turf floor up
 * close ~105)...
 */
export const BAND_INK_MIN_SATURATION = 0.5;
export const BAND_INK_MIN_VALUE = 140;
/** ...and its pixels this close to their mean (RGB distance, root mean square): the band is flat, a lit floor isn't. */
export const BAND_INK_MAX_DEVIATION = 14;

/** A core column this dark is the band before the flag, its middle left dark by the count-up. */
export const BAND_DARK_MAX_VALUE = 70;

/** A pixel above the core still of the band: its column's hue this close (the lighter wave of a time-up band), or the white score text. */
export const BAND_TOP_MAX_HUE_DISTANCE = 25;
export const BAND_TOP_MIN_SATURATION = 0.3;
export const BAND_TOP_MIN_VALUE = 70;
export const BAND_TEXT_MIN_VALUE = 170;
export const BAND_TEXT_MAX_SPREAD = 50;

/** Columns in one ink: hue this close to the first column of it. */
export const INK_GROUP_MAX_HUE_DISTANCE = 25;
/** A team's share of the band spans at least this many columns, fewer are a splash or Judd's flag over it. */
export const INK_GROUP_MIN_COLUMNS = 5;
