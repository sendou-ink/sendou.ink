/**
 * ObjectiveDetector: parses the ranked in-match counter overlay top-center —
 * each team's count plate, the penalty pill under it, and which team is in
 * control (the controlling team's plate swaps to a near-black fill with the
 * digits in the team's ink color; see rois.ts for the layout).
 *
 * Digits are read as the trailing digit run (banner.ts) of the band under
 * several channel extractions: team-color ink on the black plate needs the
 * brightest channel (dark blue ink is near-black in luminance), white ink
 * on a team-color fill needs the darkest channel (which drops the fill and
 * keeps white) — every extraction is tried at each threshold/size and the
 * best-scoring read wins. A gate hit that yields no readable count on
 * either side emits nothing (lookalike frame).
 *
 * The data is a discriminated union on `mode`, prepared for the counter
 * semantics of the other modes; only the SZ member exists so far and every
 * read is reported as it. Identifying the mode from the objective badge
 * between the plates is left for when TC/RM/CB fixtures land.
 */
import { getCV, type Mat, minMaxLoc } from "../../cv";
import { type GlyphSet, recognizeText, scaleGlyphSet } from "../../glyphs";
import {
	copyRoi,
	maxBrightness,
	maxChannel,
	meanBrightness,
	minChannel,
	type Roi,
} from "../../image";
import {
	type BannerScoreRead,
	isBetterRead,
	trailingDigitRun,
} from "../scoreboard/banner";
import type { ScoreboardResources } from "../scoreboard/index";
import type { DetectedEvent, Detector, GateResult } from "../types";
import {
	CONTROL_PLATE_MAX_MEAN,
	CONTROL_PLATE_MAX_SATURATION,
	GATE_PLATE_MAX_MEAN,
	GATE_PLATE_MAX_STD,
	GATE_SCORE_MIN_MAX_BRIGHTNESS,
	GATE_TIMER_MAX_MEAN,
	GATE_TIMER_MIN_MAX_BRIGHTNESS,
	PENALTY_BIN_THRESHOLD,
	PENALTY_PROBE_MAX_MEAN,
	PENALTY_PROBE_MAX_STD,
	PENALTY_PROBE_ROIS,
	PENALTY_ROIS,
	PENALTY_TEXT_HEIGHT,
	PLATE_PROBE_ROIS,
	SCORE_BIN_THRESHOLDS,
	SCORE_ROIS,
	SCORE_TEXT_HEIGHTS,
	TIMER_DARK_PROBES,
	TIMER_DIGIT_ROI,
} from "./rois";

export type ObjectiveData = SplatZonesObjectiveData;

export interface SplatZonesObjectiveData {
	mode: "SZ";
	/** displayed count per team, [alpha, bravo]; null = unreadable */
	score: [number | null, number | null];
	/** penalty pill value per team; null = no pill (or unreadable) */
	penalty: [number | null, number | null];
	/** which team currently holds the zone (team-ink digits on black plate) */
	control: [boolean, boolean];
}

export const OBJECTIVE_EVENT_TYPE = "Objective";

/** How often the counter is worth checking (it changes at most 1/s). */
const CHECK_INTERVAL_SECONDS = 1;

/**
 * Timeline content guard: consecutive counter reads merge only when they
 * show the same state, so every actual tick/penalty/control change becomes
 * its own event.
 */
export function sameObjectiveData(a: unknown, b: unknown): boolean {
	const da = a as ObjectiveData;
	const db = b as ObjectiveData;
	return (
		da.mode === db.mode &&
		da.score[0] === db.score[0] &&
		da.score[1] === db.score[1] &&
		da.penalty[0] === db.penalty[0] &&
		da.penalty[1] === db.penalty[1] &&
		da.control[0] === db.control[0] &&
		da.control[1] === db.control[1]
	);
}

interface SideRead {
	score: BannerScoreRead;
	penalty: BannerScoreRead | null;
	control: boolean;
	fill: { mean: number; saturation: number };
}

export function createObjectiveDetector(
	resources: ScoreboardResources,
): Detector<ObjectiveData> {
	const cv = getCV();

	const scoreSets: GlyphSet[] = resources.paintDigits
		? SCORE_TEXT_HEIGHTS.map((h) =>
				scaleGlyphSet(
					resources.paintDigits!,
					h / resources.paintDigits!.height,
				),
			)
		: [];
	const penaltySet: GlyphSet | null = resources.paintDigits
		? scaleGlyphSet(
				resources.paintDigits,
				PENALTY_TEXT_HEIGHT / resources.paintDigits.height,
			)
		: null;

	/** Mean and standard deviation of a grayscale ROI. */
	function meanStd(gray: Mat, roi: Roi): { mean: number; std: number } {
		const crop = copyRoi(gray, roi);
		const { data } = crop;
		let sum = 0;
		for (const v of data) sum += v;
		const mean = sum / data.length;
		let varSum = 0;
		for (const v of data) varSum += (v - mean) ** 2;
		crop.delete();
		return { mean, std: Math.sqrt(varSum / data.length) };
	}

	function plateProbeOk(gray: Mat, roi: Roi): boolean {
		const { mean, std } = meanStd(gray, roi);
		return mean <= GATE_PLATE_MAX_MEAN && std <= GATE_PLATE_MAX_STD;
	}

	function scoreInkOk(frame: Mat, roi: Roi): boolean {
		const band = maxChannel(frame, roi);
		const { maxVal } = minMaxLoc(band);
		band.delete();
		return maxVal >= GATE_SCORE_MIN_MAX_BRIGHTNESS;
	}

	function gate(frame: Mat): GateResult {
		const gray = new cv.Mat();
		cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
		const checks = [
			...TIMER_DARK_PROBES.map(
				(roi) => meanBrightness(gray, roi) <= GATE_TIMER_MAX_MEAN,
			),
			maxBrightness(gray, TIMER_DIGIT_ROI) >= GATE_TIMER_MIN_MAX_BRIGHTNESS,
			plateProbeOk(gray, PLATE_PROBE_ROIS[0]),
			plateProbeOk(gray, PLATE_PROBE_ROIS[1]),
			scoreInkOk(frame, SCORE_ROIS[0]),
			scoreInkOk(frame, SCORE_ROIS[1]),
		];
		gray.delete();
		const passed = checks.filter(Boolean).length;
		return { pass: passed === checks.length, score: passed / checks.length };
	}

	/**
	 * Best trailing-digit read of the band across channel extractions,
	 * thresholds, and glyph sizes (see module header for why one pass
	 * cannot cover both plate styles).
	 */
	function readScore(frame: Mat, gray: Mat, roi: Roi): BannerScoreRead {
		let best: BannerScoreRead = {
			value: null,
			confidence: 0,
			digits: 0,
			reading: "",
		};
		const bands = [
			copyRoi(gray, roi),
			minChannel(frame, roi),
			maxChannel(frame, roi),
		];
		for (const band of bands) {
			for (const set of scoreSets) {
				for (const binThreshold of SCORE_BIN_THRESHOLDS) {
					const raw = recognizeText(band, set, {
						binThreshold,
						spaceGap: Number.POSITIVE_INFINITY,
						minCharScore: 0.3,
					});
					const read = trailingDigitRun(raw, set);
					if (isBetterRead(read, best)) best = read;
				}
			}
			band.delete();
		}
		return best;
	}

	/** Penalty pill: presence probes first, then the white "+N" digits. */
	function readPenalty(
		frame: Mat,
		gray: Mat,
		side: 0 | 1,
	): BannerScoreRead | null {
		if (!penaltySet) return null;
		const pillLike = PENALTY_PROBE_ROIS[side].every((roi) => {
			const { mean, std } = meanStd(gray, roi);
			return mean <= PENALTY_PROBE_MAX_MEAN && std <= PENALTY_PROBE_MAX_STD;
		});
		if (!pillLike) return null;
		const band = minChannel(frame, PENALTY_ROIS[side]);
		const raw = recognizeText(band, penaltySet, {
			binThreshold: PENALTY_BIN_THRESHOLD,
			spaceGap: Number.POSITIVE_INFINITY,
			minCharScore: 0.3,
		});
		band.delete();
		return trailingDigitRun(raw, penaltySet);
	}

	/**
	 * Control: the plate's fill (sampled over the probe strip) is the
	 * neutral near-black style — dark AND unsaturated — instead of the
	 * non-controlling team-color fill (see CONTROL_PLATE_MAX_* in rois.ts).
	 */
	function plateFill(
		frame: Mat,
		side: 0 | 1,
	): { mean: number; saturation: number } {
		const crop = copyRoi(frame, PLATE_PROBE_ROIS[side]);
		const { data } = crop;
		const channels = crop.channels();
		let sum = 0;
		let satSum = 0;
		let count = 0;
		for (let i = 0; i < data.length; i += channels) {
			const r = data[i]!;
			const g = data[i + 1]!;
			const b = data[i + 2]!;
			sum += Math.max(r, g, b);
			satSum += Math.max(r, g, b) - Math.min(r, g, b);
			count++;
		}
		crop.delete();
		return { mean: sum / count, saturation: satSum / count };
	}

	function parse(frame: Mat, t: number): DetectedEvent<ObjectiveData>[] {
		const gray = new cv.Mat();
		cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);

		const sides = [0 as const, 1 as const].map((side): SideRead => {
			const score = readScore(frame, gray, SCORE_ROIS[side]);
			const penalty = readPenalty(frame, gray, side);
			const fill = plateFill(frame, side);
			return {
				score,
				penalty,
				control:
					score.value !== null &&
					fill.mean <= CONTROL_PLATE_MAX_MEAN &&
					fill.saturation <= CONTROL_PLATE_MAX_SATURATION,
				fill,
			};
		}) as [SideRead, SideRead];
		gray.delete();

		// no readable count on either side = the gate hit a lookalike
		if (sides.every((side) => side.score.value === null)) return [];

		const confidences = sides.flatMap((side) => [
			...(side.score.value !== null ? [side.score.confidence] : []),
			...(side.penalty?.value != null ? [side.penalty.confidence] : []),
		]);
		return [
			{
				type: OBJECTIVE_EVENT_TYPE,
				t,
				confidence: confidences.reduce((a, b) => a + b, 0) / confidences.length,
				data: {
					mode: "SZ",
					score: [sides[0].score.value, sides[1].score.value],
					penalty: [
						sides[0].penalty?.value ?? null,
						sides[1].penalty?.value ?? null,
					],
					control: [sides[0].control, sides[1].control],
				},
				debug: {
					scoreReadings: sides.map((side) => side.score.reading),
					scoreConfidences: sides.map((side) => side.score.confidence),
					penaltyReadings: sides.map((side) => side.penalty?.reading ?? null),
					plateFills: sides.map((side) => side.fill),
				},
			},
		];
	}

	return {
		id: "objective",
		checkIntervalS: CHECK_INTERVAL_SECONDS,
		attachFrame: false,
		gate,
		parse,
	};
}
