/**
 * XSetCountDetector: the X Battle card shown after every game that leaves the
 * set undecided — "WINS LOSSES / 1 - 2" over a row of win slots (dashed
 * circle → VICTORY splat) and loss slots (orange squid → crossed-out grey
 * one). The card opens on the score before the game, fills the new slot,
 * and only then flips the digits (~0.5s before it fades), so a read is only
 * trusted when the digits agree with the slots, and the timeline keeps the
 * furthest-along read (`xSetCountProgress`), never the first.
 */
import type { RankedModeShort } from "~/modules/in-game-lists/types";
import type { Mat } from "../../cv";
import { type GlyphSet, scaleGlyphSet } from "../../glyphs";
import { frameGray, frameRgb, type Roi, roiSignature } from "../../image";
import { all, type MatchSteps, runSync } from "../../match-steps";
import type { ScoreboardResources } from "../scoreboard/index";
import type { DetectedEvent, Detector, GateResult } from "../types";
import {
	CARD_DARK_MAX_MEAN,
	CARD_ICON_ROI,
	COUNT_DARK_PROBES,
	COUNT_DIGIT_HEIGHT,
	COUNT_LABEL_BAND,
	COUNT_LOSS_SLOT_CENTERS_X,
	COUNT_LOSS_SLOT_HALF,
	COUNT_LOSS_SLOT_Y,
	COUNT_LOSSES_DIGIT_ROI,
	COUNT_SIGNATURE_ROI,
	COUNT_WIN_SLOT_CENTERS_X,
	COUNT_WIN_SLOT_HALF,
	COUNT_WIN_SLOT_Y,
	COUNT_WINS_DIGIT_ROI,
	NUMBER_BIN_THRESHOLD,
} from "./rois";
import {
	allDark,
	brightFraction,
	minScore,
	readModeIconSteps,
	readNumberSteps,
	rgbFraction,
} from "./shared";

export const X_SET_COUNT_EVENT_TYPE = "XSetCount";

export interface XSetCountData {
	mode: RankedModeShort | null;
	/** 0-2: the card never shows a decided set */
	wins: number | null;
	losses: number | null;
}

/** Digit cells hold one glyph: ink fraction of a lone "1" up to a popping digit. */
const DIGIT_MIN_FRACTION = 0.08;
const DIGIT_MAX_FRACTION = 0.6;
const LABEL_MIN_FRACTION = 0.04;
/** A win slot's VICTORY splat is saturated ink over most of its box; the dashed circle is white. */
const WIN_SLOT_MIN_INK = 0.3;
/** A lost squid's white X; the live squid is saturated orange, the empty card black. */
const LOSS_SLOT_MIN_CROSS = 0.04;
/** Confidence of a read whose digits disagree with its slots (mid-animation): under the timeline floor. */
const INCONSISTENT_CONFIDENCE = 0.3;
const SET_GAMES = 3;

/**
 * Timeline animation order of two reads of one card: positive when `b` has
 * more games counted (the digits only ever count up while the card shows).
 */
export function xSetCountProgress(a: unknown, b: unknown): number {
	const games = (data: XSetCountData) =>
		data.wins === null || data.losses === null ? -1 : data.wins + data.losses;
	return games(b as XSetCountData) - games(a as XSetCountData);
}

export function createXSetCountDetector(
	resources: ScoreboardResources,
): Detector<XSetCountData> {
	let digits: GlyphSet | null | undefined;
	const digitGlyphs = () => {
		digits ??= resources.teamDigits
			? scaleGlyphSet(
					resources.teamDigits,
					COUNT_DIGIT_HEIGHT / resources.teamDigits.height,
				)
			: null;
		return digits;
	};

	function gate(frame: Mat): GateResult {
		const gray = frameGray(frame);
		const dark = allDark(gray, COUNT_DARK_PROBES, CARD_DARK_MAX_MEAN);
		const label = brightFraction(gray, COUNT_LABEL_BAND, NUMBER_BIN_THRESHOLD);
		const digitFractions = [COUNT_WINS_DIGIT_ROI, COUNT_LOSSES_DIGIT_ROI].map(
			(roi) => brightFraction(gray, roi, NUMBER_BIN_THRESHOLD),
		);
		const digitsOk = digitFractions.every(
			(f) => f >= DIGIT_MIN_FRACTION && f <= DIGIT_MAX_FRACTION,
		);
		const checks = [dark, label >= LABEL_MIN_FRACTION, digitsOk];
		const pass = checks.every(Boolean);
		return {
			pass,
			score: checks.filter(Boolean).length / checks.length,
			signature: pass
				? roiSignature(gray, COUNT_SIGNATURE_ROI, 6, 5)
				: undefined,
		};
	}

	function* parseSteps(
		frame: Mat,
		t: number,
		_gate: GateResult | undefined,
		speculative: boolean,
	): MatchSteps<DetectedEvent<XSetCountData>[]> {
		const set = digitGlyphs();
		if (!set) return [];
		const gray = frameGray(frame);
		const rgb = frameRgb(frame);
		const [winsRead, lossesRead, icon] = yield* all([
			readNumberSteps(
				gray,
				COUNT_WINS_DIGIT_ROI,
				set,
				NUMBER_BIN_THRESHOLD,
				speculative,
			),
			readNumberSteps(
				gray,
				COUNT_LOSSES_DIGIT_ROI,
				set,
				NUMBER_BIN_THRESHOLD,
				speculative,
			),
			readModeIconSteps(rgb, CARD_ICON_ROI, resources.modeIcons),
		]);
		const wins = setDigit(winsRead.text);
		const losses = setDigit(lossesRead.text);
		const winSlots = COUNT_WIN_SLOT_CENTERS_X.filter(
			(x) =>
				rgbFraction(
					rgb,
					slotRoi(x, COUNT_WIN_SLOT_Y, COUNT_WIN_SLOT_HALF),
					isInk,
				) >= WIN_SLOT_MIN_INK,
		).length;
		const lossSlots = COUNT_LOSS_SLOT_CENTERS_X.filter(
			(x) =>
				rgbFraction(
					rgb,
					slotRoi(x, COUNT_LOSS_SLOT_Y, COUNT_LOSS_SLOT_HALF),
					isCrossStroke,
				) >= LOSS_SLOT_MIN_CROSS,
		).length;
		const consistent = wins === winSlots && losses === lossSlots;
		const digitScore = minScore([
			...winsRead.digitScores,
			...lossesRead.digitScores,
		]);
		return [
			{
				type: X_SET_COUNT_EVENT_TYPE,
				t,
				confidence: consistent
					? digitScore
					: Math.min(digitScore, INCONSISTENT_CONFIDENCE),
				data: { mode: icon.mode, wins, losses },
				debug: {
					winsReading: winsRead.text,
					lossesReading: lossesRead.text,
					digitScore,
					winSlots,
					lossSlots,
					modeScore: icon.score,
				},
			},
		];
	}

	return {
		id: "x-set-count",
		gate,
		parse: (frame, t, gateResult) =>
			runSync(parseSteps(frame, t, gateResult, false)),
		parseSteps,
	};
}

function setDigit(text: string): number | null {
	const value = /^\d$/.test(text) ? Number(text) : null;
	return value !== null && value < SET_GAMES ? value : null;
}

function slotRoi(cx: number, cy: number, half: number): Roi {
	return { x: cx - half, y: cy - half, w: 2 * half, h: 2 * half };
}

function isInk(r: number, g: number, b: number): boolean {
	const max = Math.max(r, g, b);
	return max >= 150 && max - Math.min(r, g, b) >= 90;
}

function isCrossStroke(r: number, g: number, b: number): boolean {
	return (
		Math.min(r, g, b) >= 170 && Math.max(r, g, b) - Math.min(r, g, b) <= 40
	);
}
