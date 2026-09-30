/**
 * The top-center match timer (M:SS in a near-black box), read by the objective
 * counter and the kill feed alike so both land on the same game-clock axis.
 * The colon's dots fall under the digit height floor, so a valid read is
 * exactly three full-height digits; each glyph size is tried (digits render
 * bigger on upscaled 720p) and the most confident valid read wins.
 */
import type { Mat } from "../../cv";
import {
	type GlyphSet,
	type RecognizedChar,
	recognizeText,
	scaleGlyphSet,
} from "../../glyphs";
import { copyRoi, maxBrightness, meanBrightness } from "../../image";
import type { ScoreboardResources } from "../scoreboard/index";
import {
	GATE_TIMER_MAX_MEAN,
	GATE_TIMER_MIN_MAX_BRIGHTNESS,
	TIMER_BIN_THRESHOLD,
	TIMER_DARK_PROBES,
	TIMER_DIGIT_MIN_CONF,
	TIMER_DIGIT_MIN_HEIGHT_RATIO,
	TIMER_DIGIT_ROI,
	TIMER_TEXT_HEIGHTS,
} from "./rois";

export interface TimerRead {
	/** match timer seconds ("3:35" = 215); null = unreadable */
	value: number | null;
	/** the raw digit-run reading, for debugging */
	reading: string;
}

/** Paint digits rescaled to each attested timer digit size; empty without the atlas. */
export function timerGlyphSets(resources: ScoreboardResources): GlyphSet[] {
	const digits = resources.paintDigits;
	if (!digits) return [];
	return TIMER_TEXT_HEIGHTS.map((h) =>
		scaleGlyphSet(digits, h / digits.height),
	);
}

/** Per-probe presence checks of the timer box: dark surround, then bright digits. */
export function timerBoxChecks(gray: Mat): boolean[] {
	return [
		...TIMER_DARK_PROBES.map(
			(roi) => meanBrightness(gray, roi) <= GATE_TIMER_MAX_MEAN,
		),
		maxBrightness(gray, TIMER_DIGIT_ROI) >= GATE_TIMER_MIN_MAX_BRIGHTNESS,
	];
}

export function readMatchTimer(
	gray: Mat,
	timerSets: readonly GlyphSet[],
): TimerRead {
	const band = copyRoi(gray, TIMER_DIGIT_ROI);
	let best: TimerRead & { score: number } = {
		value: null,
		reading: "",
		score: 0,
	};
	for (const timerSet of timerSets) {
		const raw = recognizeText(band, timerSet, {
			binThreshold: TIMER_BIN_THRESHOLD,
			spaceGap: Number.POSITIVE_INFINITY,
			minCharScore: 0.3,
		});
		if (!best.reading) best = { ...best, reading: raw.text };
		const isTimerDigit = (c: RecognizedChar) =>
			c.score >= TIMER_DIGIT_MIN_CONF &&
			c.y1 - c.y0 >= timerSet.height * TIMER_DIGIT_MIN_HEIGHT_RATIO;
		const chars = raw.chars.filter(isTimerDigit);
		const digits = chars.map((c) => Number(c.char));
		if (digits.length !== 3 || digits.some(Number.isNaN)) continue;
		const [minutes, secondsTens, secondsOnes] = digits as [
			number,
			number,
			number,
		];
		if (secondsTens >= 6) continue;
		const score = chars.reduce((sum, c) => sum + c.score, 0) / chars.length;
		if (score > best.score) {
			best = {
				value: minutes * 60 + secondsTens * 10 + secondsOnes,
				reading: raw.text,
				score,
			};
		}
	}
	band.delete();
	return { value: best.value, reading: best.reading };
}
