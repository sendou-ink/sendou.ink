/**
 * XRankPositionDetector: the X Rank position card after the set result —
 * teal "Position", "Estimate", the yellow "#259" and an arrow: grey and
 * pointing down when the position number grew, orange and up when it shrank. The number counts from the old position
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

export type XRankPositionDirection = "UP" | "DOWN";

export interface XRankPositionData {
	mode: RankedModeShort | null;
	position: number | null;
	direction: XRankPositionDirection | null;
}

/** Confidence of a read whose number didn't parse: under the timeline floor. */
const UNREAD_CONFIDENCE = 0.3;
/** The arrow is ~165px tall; a shorter white run is something else. */
const ARROW_MIN_HEIGHT = 100;
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
	if (da.position === null || db.position === null || !direction) return 0;
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
			rgbFraction(rgb, POSITION_NUMBER_ROI, isNumberYellow) >=
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
				"skip",
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

/** The arrow's shaft end is wide, its head ends in a point: whichever end is narrower is where it points. */
function arrowDirection(rgb: Mat): XRankPositionDirection | null {
	const crop = copyRoi(rgb, POSITION_ARROW_ROI);
	const { rows, cols } = crop;
	const data = crop.data;
	const widths = new Array<number>(rows).fill(0);
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			const i = (y * cols + x) * 3;
			if (isArrowInk(data[i]!, data[i + 1]!, data[i + 2]!)) widths[y]!++;
		}
	}
	crop.delete();
	const y0 = widths.findIndex((w) => w > 0);
	const y1 = widths.findLastIndex((w) => w > 0);
	if (y0 < 0 || y1 - y0 < ARROW_MIN_HEIGHT) return null;
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

function isNumberYellow(r: number, g: number, b: number): boolean {
	return r >= 170 && g >= 170 && b <= 110;
}

/** DOWN is a light grey arrow darkening toward its head, UP an orange one; the card around them is near-black. */
function isArrowInk(r: number, g: number, b: number): boolean {
	return Math.max(r, g, b) >= 100;
}
