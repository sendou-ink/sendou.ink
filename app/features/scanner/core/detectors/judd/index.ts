/**
 * JuddFlagDetector: the results screen after a game, the moment Judd or Lil'
 * Judd raises the flag for the winner. Until then the band across the bottom
 * is dark, each team's score counting up from its end; with the flag it fills
 * edge to edge in ink: the winner's alone after a knockout, otherwise each
 * team's share of the points, split where the shares meet. So the band read
 * whole in one or two inks, left one then right one, is the flag. The cats
 * and the flag move, the labels and the score text are localized, the band's
 * ends sit under a cast's lower thirds: none of them is read.
 *
 * Plain ink across the bottom is no rare sight mid-game (a turf floor up
 * close, a cast's own lower third), so a column counts only when its ink
 * stops at the band's top edge (y≈826-890): flat ink in the rows under the
 * score text, the same hue (its lighter wave) or the white text above them,
 * then the dark rim or the map.
 */
import * as R from "remeda";
import * as Decisions from "../../decisions";
import * as FieldScores from "../../field-scores";
import { frameRgb, type Image, type Roi } from "../../image";
import { hueDistance, hueOf, type InkRgb } from "../../ink-color";
import { done, type MatchSteps, runSync } from "../../match-steps";
import type { Detector, EventKind, EventOf, GateResult } from "../types";
import {
	BAND_COLUMN_STEP,
	BAND_CORE_BOTTOM,
	BAND_CORE_ROW_STEP,
	BAND_CORE_TOP,
	BAND_DARK_MAX_VALUE,
	BAND_FIRST_COLUMN,
	BAND_INK_MAX_DEVIATION,
	BAND_INK_MIN_SATURATION,
	BAND_INK_MIN_VALUE,
	BAND_LAST_COLUMN,
	BAND_MIDDLE_LEFT,
	BAND_MIDDLE_RIGHT,
	BAND_TEXT_MAX_SPREAD,
	BAND_TEXT_MIN_VALUE,
	BAND_TOP_END_ROWS,
	BAND_TOP_MAX_HUE_DISTANCE,
	BAND_TOP_MAX_Y,
	BAND_TOP_MIN_SATURATION,
	BAND_TOP_MIN_VALUE,
	BAND_TOP_MIN_Y,
	BAND_TOP_SCAN_STEP,
	BAND_TOP_SCAN_Y,
	INK_GROUP_MAX_HUE_DISTANCE,
	INK_GROUP_MIN_COLUMNS,
} from "./rois";

export interface JuddFlagData {
	/** The band's ink left to right as drawn: the winner's alone after a knockout, each team's share otherwise. */
	inks: InkRgb[];
	/** The winner's ink: the band's only one, or its wider share. `null` when the shares are too close to tell. */
	winnerInk: InkRgb | null;
}

export const JUDD_FLAG_EVENT_TYPE = "JuddFlag";

/** The band's inks and the winner's are read as one. */
const BAND_FIELDS = "inks,winnerInk";

export const JUDD_FLAG_EVENT: EventKind<
	typeof JUDD_FLAG_EVENT_TYPE,
	JuddFlagData
> = {
	type: JUDD_FLAG_EVENT_TYPE,
	// the flag stays up ~3.5s, the next game's is minutes away
	mergeWindowS: 30,
	// the gate checked the band whole, later frames show the same
	complete: ({ scores }) => FieldScores.reach(scores, [BAND_FIELDS], 0),
};

export type JuddFlagEvent = EventOf<typeof JUDD_FLAG_EVENT>;

/**
 * Share of the sampled columns showing the band: a cast's lower thirds or a streamer's box cover the rest (fixtures
 * 0.73+, an inked floor up close ≤0.64).
 */
const BAND_MIN_COLUMNS = 0.66;
/** Share of the band's columns whose ink stops at its top edge (fixtures 0.8+, an inked floor's far edge ≤0.64). */
const TOP_EDGE_MIN_COLUMNS = 0.7;
/** Band columns in neither of the two inks, e.g. Judd's flag dipping into the band. */
const MAX_STRAY_COLUMNS = 3;
/** Dark columns in the band's middle, where the count-up leaves it dark until the flag (the seam of two shares isn't). */
const MAX_MIDDLE_DARK_COLUMNS = 2;
/** The band spans this much of the canonical frame, its shares split it as the points do. */
const BAND_LEFT = 60;
const BAND_RIGHT = 1860;
/** The shares split this close to the middle tell no winner: a point or two apart. */
const MIN_WINNER_MARGIN = 24;

const COLUMNS: number[] = [];
for (let x = BAND_FIRST_COLUMN; x <= BAND_LAST_COLUMN; x += BAND_COLUMN_STEP) {
	COLUMNS.push(x);
}

const GATE_ROIS: Roi[] = COLUMNS.map((x) => ({
	x,
	y: BAND_TOP_SCAN_Y,
	w: 1,
	h: BAND_CORE_BOTTOM - BAND_TOP_SCAN_Y,
}));

interface BandColumn {
	x: number;
	/** Mean color of the core rows, `null` when they aren't plain ink. */
	ink: InkRgb | null;
	isDark: boolean;
	hue: number;
	/** The column's ink stops at the band's top edge. */
	isTopped: boolean;
}

interface BandRead {
	pass: boolean;
	score: number;
	data: JuddFlagData | null;
}

export function createJuddFlagDetector(): Detector<JuddFlagEvent> {
	function gate(frame: Image): GateResult {
		const read = readBand(frameRgb(frame));
		return { pass: read.pass, score: read.score };
	}

	function parseSteps(frame: Image, t: number): MatchSteps<JuddFlagEvent[]> {
		const read = readBand(frameRgb(frame));
		if (!read.pass || !read.data) return done([]);

		return done([
			{
				type: JUDD_FLAG_EVENT_TYPE,
				t,
				scores: FieldScores.of({ [BAND_FIELDS]: read.score }),
				data: read.data,
			},
		]);
	}

	return {
		id: "judd",
		gateRois: GATE_ROIS,
		gate,
		parse: (frame, t) => runSync(parseSteps(frame, t)),
		parseSteps,
	};
}

function readBand(rgb: Image): BandRead {
	const columns = COLUMNS.map((x) => readColumn(rgb, x));
	const band = columns.filter((column) => column.ink !== null);
	const bandShare = band.length / columns.length;
	const toppedShare =
		band.filter((column) => column.isTopped).length / Math.max(1, band.length);
	const groups = inkGroups(band);
	const strays = band.length - R.sumBy(groups, (group) => group.length);
	const middleDark = columns.filter(
		(column) =>
			column.x >= BAND_MIDDLE_LEFT &&
			column.x <= BAND_MIDDLE_RIGHT &&
			column.isDark,
	).length;

	const pass =
		Decisions.atLeast("judd:BAND_MIN_COLUMNS", bandShare, BAND_MIN_COLUMNS) &&
		Decisions.atLeast(
			"judd:TOP_EDGE_MIN_COLUMNS",
			toppedShare,
			TOP_EDGE_MIN_COLUMNS,
		) &&
		groups.length > 0 &&
		Decisions.atMost("judd:MAX_STRAY_COLUMNS", strays, MAX_STRAY_COLUMNS) &&
		Decisions.atMost(
			"judd:MAX_MIDDLE_DARK_COLUMNS",
			middleDark,
			MAX_MIDDLE_DARK_COLUMNS,
		) &&
		isSideBySide(band, groups);
	const score = Math.min(bandShare, toppedShare);
	if (!pass) return { pass, score, data: null };

	return { pass, score, data: bandData(groups) };
}

function readColumn(rgb: Image, x: number): BandColumn {
	const { cols, channels, data } = rgb;
	const pixel = (y: number): InkRgb => {
		const i = (y * cols + x) * channels;
		return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]! };
	};

	const core: InkRgb[] = [];
	for (let y = BAND_CORE_TOP; y < BAND_CORE_BOTTOM; y += BAND_CORE_ROW_STEP) {
		core.push(pixel(y));
	}
	const mean = meanColor(core);
	const hue = hueOf(mean);
	const deviation = Math.sqrt(
		core.reduce(
			(sum, p) =>
				sum + (p.r - mean.r) ** 2 + (p.g - mean.g) ** 2 + (p.b - mean.b) ** 2,
			0,
		) / core.length,
	);
	const isInk =
		saturation(mean) >= BAND_INK_MIN_SATURATION &&
		value(mean) >= BAND_INK_MIN_VALUE &&
		deviation <= BAND_INK_MAX_DEVIATION;
	const isDark = value(mean) < BAND_DARK_MAX_VALUE;
	if (!isInk) return { x, ink: null, isDark, hue, isTopped: false };

	let top = BAND_CORE_TOP;
	let misses = 0;
	for (
		let y = BAND_CORE_TOP - BAND_TOP_SCAN_STEP;
		y >= BAND_TOP_SCAN_Y;
		y -= BAND_TOP_SCAN_STEP
	) {
		if (isOfBand(pixel(y), hue)) {
			misses = 0;
			top = y;
		} else if (++misses >= BAND_TOP_END_ROWS) {
			break;
		}
	}

	return {
		x,
		ink: mean,
		isDark,
		hue,
		isTopped: top >= BAND_TOP_MIN_Y && top <= BAND_TOP_MAX_Y,
	};
}

function isOfBand(pixel: InkRgb, hue: number) {
	const max = Math.max(pixel.r, pixel.g, pixel.b);
	const spread = max - Math.min(pixel.r, pixel.g, pixel.b);
	const isText = max >= BAND_TEXT_MIN_VALUE && spread <= BAND_TEXT_MAX_SPREAD;

	return (
		isText ||
		(saturation(pixel) >= BAND_TOP_MIN_SATURATION &&
			max >= BAND_TOP_MIN_VALUE &&
			hueDistance(hueOf(pixel), hue) <= BAND_TOP_MAX_HUE_DISTANCE)
	);
}

/** The band's columns by ink, the two widest that are wide enough to be a team's share, left one first. */
function inkGroups(band: BandColumn[]): BandColumn[][] {
	const groups: { hue: number; columns: BandColumn[] }[] = [];
	for (const column of band) {
		const group = groups.find(
			(candidate) =>
				hueDistance(candidate.hue, column.hue) <= INK_GROUP_MAX_HUE_DISTANCE,
		);
		if (group) group.columns.push(column);
		else groups.push({ hue: column.hue, columns: [column] });
	}

	return groups
		.map((group) => group.columns)
		.filter((columns) => columns.length >= INK_GROUP_MIN_COLUMNS)
		.sort((a, b) => b.length - a.length)
		.slice(0, 2)
		.sort((a, b) => a[0]!.x - b[0]!.x);
}

/** Two inks each keep to their side of the band, as the shares do: one switch going left to right. */
function isSideBySide(band: BandColumn[], groups: BandColumn[][]) {
	if (groups.length < 2) return true;

	const [left, right] = groups as [BandColumn[], BandColumn[]];
	const sides = band
		.filter((column) => left.includes(column) || right.includes(column))
		.map((column) => left.includes(column));

	return sides.filter((side, i) => i > 0 && side !== sides[i - 1]).length <= 1;
}

function bandData(groups: BandColumn[][]): JuddFlagData {
	const inks = groups.map((columns) =>
		meanColor(columns.map((column) => column.ink!)),
	);
	if (inks.length === 1) return { inks, winnerInk: inks[0]! };

	const [left, right] = groups as [BandColumn[], BandColumn[]];
	const split = (left.at(-1)!.x + right[0]!.x) / 2;
	const middle = (BAND_LEFT + BAND_RIGHT) / 2;
	const winnerInk =
		Math.abs(split - middle) < MIN_WINNER_MARGIN
			? null
			: split > middle
				? inks[0]!
				: inks[1]!;

	return { inks, winnerInk };
}

function meanColor(colors: InkRgb[]): InkRgb {
	const sum = colors.reduce(
		(acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }),
		{ r: 0, g: 0, b: 0 },
	);
	return {
		r: Math.round(sum.r / colors.length),
		g: Math.round(sum.g / colors.length),
		b: Math.round(sum.b / colors.length),
	};
}

function value(color: InkRgb) {
	return Math.max(color.r, color.g, color.b);
}

function saturation(color: InkRgb) {
	const max = value(color);
	return max === 0 ? 0 : (max - Math.min(color.r, color.g, color.b)) / max;
}
