/**
 * XRankPositionDetector: the X Rank position card after the set result —
 * teal "Position", "Estimate", the yellow "#259" (the Japanese card: a white
 * "1位") and an arrow: grey and pointing down when the position number grew,
 * orange and up when it shrank, green and pointing right when it held. The
 * arrow follows the number, so it is found as the card's rightmost ink. The number counts from the old position
 * toward the new one in the arrow's direction for ~0.5s and holds the final
 * value only ~0.3s before the card fades, so the timeline keeps the read
 * furthest along that direction (`xRankPositionProgress`).
 */
import type { RankedModeShort } from "~/modules/in-game-lists/types";
import type { Mat } from "../../cv";
import { type GlyphSet, scaleGlyphSet } from "../../glyphs";
import { copyRoi, frameGray, frameRgb, roiSignature } from "../../image";
import { all, type MatchSteps, runSync } from "../../match-steps";
import type { ScoreboardResources } from "../scoreboard/index";
import type { DetectedEvent, Detector, GateResult } from "../types";
import {
	CARD_DARK_MAX_MEAN,
	NUMBER_BIN_THRESHOLD,
	POSITION_ARROW_ROI,
	POSITION_DARK_PROBES,
	POSITION_ICON_ROI,
	POSITION_LABEL_MIN_FRACTION,
	POSITION_LABEL_ROI,
	POSITION_NUMBER_HEIGHT,
	POSITION_NUMBER_MIN_FRACTION,
	POSITION_NUMBER_ROI,
} from "./rois";
import {
	allDark,
	minScore,
	readModeIconSteps,
	readNumberSteps,
	rgbFraction,
} from "./shared";

export const X_RANK_POSITION_EVENT_TYPE = "XRankPosition";

export type XRankPositionDirection = "UP" | "DOWN" | "SAME";

export interface XRankPositionData {
	mode: RankedModeShort | null;
	position: number | null;
	direction: XRankPositionDirection | null;
}

/** Confidence of a read whose number didn't parse: under the timeline floor. */
const UNREAD_CONFIDENCE = 0.3;
/** The arrow is ~155px long; a shorter run of ink is something else. */
const ARROW_MIN_LENGTH = 90;
/** Columns with fewer ink pixels are speckle. */
const ARROW_COLUMN_MIN_INK = 3;
/** The arrow's tail stripes sit closer than this; the number ends ≥25px before it. */
const ARROW_MAX_COLUMN_GAP = 8;
/** Rows sampled at each end of the arrow, as a fraction of its height. */
const ARROW_END_FRACTION = 0.12;
/** The shaft end is several times wider than the head's tip. */
const ARROW_END_RATIO = 1.5;

/**
 * Timeline animation order of two reads of one card: positive when `b`'s
 * number is further along the arrow's direction (a DOWN arrow counts up).
 */
export function xRankPositionProgress(a: unknown, b: unknown): number {
	const da = a as XRankPositionData;
	const db = b as XRankPositionData;
	const direction = db.direction ?? da.direction;
	if (
		da.position === null ||
		db.position === null ||
		!direction ||
		direction === "SAME"
	) {
		return 0;
	}
	return Math.sign(
		(db.position - da.position) * (direction === "DOWN" ? 1 : -1),
	);
}

export function createXRankPositionDetector(
	resources: ScoreboardResources,
): Detector<XRankPositionData> {
	let digits: GlyphSet | null | undefined;
	const digitGlyphs = () => {
		digits ??= resources.teamDigits
			? scaleGlyphSet(
					resources.teamDigits,
					POSITION_NUMBER_HEIGHT / resources.teamDigits.height,
				)
			: null;
		return digits;
	};

	function gate(frame: Mat): GateResult {
		const gray = frameGray(frame);
		const rgb = frameRgb(frame);
		const checks = [
			allDark(gray, POSITION_DARK_PROBES, CARD_DARK_MAX_MEAN),
			rgbFraction(rgb, POSITION_LABEL_ROI, isTitleTeal) >=
				POSITION_LABEL_MIN_FRACTION,
			rgbFraction(rgb, POSITION_NUMBER_ROI, isNumberInk) >=
				POSITION_NUMBER_MIN_FRACTION,
		];
		const pass = checks.every(Boolean);
		return {
			pass,
			score: checks.filter(Boolean).length / checks.length,
			signature: pass
				? roiSignature(gray, POSITION_NUMBER_ROI, 8, 2)
				: undefined,
		};
	}

	function* parseSteps(
		frame: Mat,
		t: number,
		_gate: GateResult | undefined,
		speculative: boolean,
	): MatchSteps<DetectedEvent<XRankPositionData>[]> {
		const set = digitGlyphs();
		if (!set) return [];
		const gray = frameGray(frame);
		const rgb = frameRgb(frame);
		const [number, icon] = yield* all([
			readNumberSteps(
				gray,
				POSITION_NUMBER_ROI,
				set,
				NUMBER_BIN_THRESHOLD,
				speculative,
				"symbols",
			),
			readModeIconSteps(rgb, POSITION_ICON_ROI, resources.modeIcons),
		]);
		const position = /^\d{1,5}$/.test(number.text) ? Number(number.text) : null;
		const numberScore = minScore(number.digitScores);
		return [
			{
				type: X_RANK_POSITION_EVENT_TYPE,
				t,
				confidence:
					position === null
						? Math.min(numberScore, UNREAD_CONFIDENCE)
						: numberScore,
				data: { mode: icon.mode, position, direction: arrowDirection(rgb) },
				debug: {
					numberReading: number.text,
					numberScore,
					modeScore: icon.score,
				},
			},
		];
	}

	return {
		id: "x-rank-position",
		gate,
		parse: (frame, t, gateResult) =>
			runSync(parseSteps(frame, t, gateResult, false)),
		parseSteps,
	};
}

/**
 * The arrow is the rightmost run of ink columns. Lying flat, it held; upright,
 * its shaft end is wide and its head ends in a point, so whichever end is
 * narrower is where it points.
 */
function arrowDirection(rgb: Mat): XRankPositionDirection | null {
	const crop = copyRoi(rgb, POSITION_ARROW_ROI);
	const { rows, cols } = crop;
	const data = crop.data;
	const isInk = (x: number, y: number) => {
		const i = (y * cols + x) * 3;
		return isArrowInk(data[i]!, data[i + 1]!, data[i + 2]!);
	};
	const inked = Array.from({ length: cols }, (_, x) => {
		let ink = 0;
		for (let y = 0; y < rows; y++) if (isInk(x, y)) ink++;
		return ink >= ARROW_COLUMN_MIN_INK;
	});
	const x1 = inked.lastIndexOf(true);
	let x0 = x1;
	for (let x = x1 - 1; x >= 0 && x0 - x <= ARROW_MAX_COLUMN_GAP; x--) {
		if (inked[x]) x0 = x;
	}
	const widths = new Array<number>(rows).fill(0);
	for (let y = 0; y < rows; y++) {
		for (let x = Math.max(0, x0); x <= x1; x++) {
			if (isInk(x, y)) widths[y]!++;
		}
	}
	crop.delete();
	const y0 = widths.findIndex((w) => w > 0);
	const y1 = widths.findLastIndex((w) => w > 0);
	if (y0 < 0) return null;
	if (x1 - x0 >= y1 - y0) return x1 - x0 >= ARROW_MIN_LENGTH ? "SAME" : null;
	if (y1 - y0 < ARROW_MIN_LENGTH) return null;
	const band = Math.max(1, Math.round((y1 - y0) * ARROW_END_FRACTION));
	const mean = (from: number) =>
		widths.slice(from, from + band).reduce((sum, w) => sum + w, 0) / band;
	const top = mean(y0);
	const bottom = mean(y1 + 1 - band);
	if (top >= bottom * ARROW_END_RATIO) return "DOWN";
	if (bottom >= top * ARROW_END_RATIO) return "UP";
	return null;
}

function isTitleTeal(r: number, g: number, b: number): boolean {
	return g >= 150 && b >= 120 && r <= 120;
}

/** Yellow "#259", or the Japanese card's white "1位". */
function isNumberInk(r: number, g: number, b: number): boolean {
	return r >= 170 && g >= 170 && (b <= 110 || b >= 170);
}

/** DOWN is a light grey arrow darkening toward its head, UP an orange one, SAME a green one; the card around them is near-black. */
function isArrowInk(r: number, g: number, b: number): boolean {
	return Math.max(r, g, b) >= 100;
}
