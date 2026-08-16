/**
 * ObjectiveDetector: parses the ranked in-match counter overlay top-center —
 * each team's count plate, the penalty pill under it, which team is in
 * control (controlling team's plate keeps its saturated team-color fill;
 * otherwise near-black fill with digits in the team's ink color — see
 * rois.ts), and the M:SS match timer above the plates.
 *
 * Digits are read as the trailing digit run (banner.ts) under several
 * channel extractions — team-color ink on a black plate needs the
 * brightest channel (dark blue ink is near-black in luminance), ink on a
 * team-color fill needs the darkest channel — every extraction is tried at
 * each threshold/size and the best-scoring read wins. A gate hit with no
 * readable count on either side emits nothing (lookalike frame).
 *
 * `ObjectiveData` is a discriminated union on `mode`; only SZ exists so
 * far. Identifying mode from the badge between the plates awaits TC/RM/CB
 * fixtures.
 *
 * Every successful counter read additionally emits a PlayerStatus event
 * (player-status.ts) parsed off the per-player icon strip of the same
 * frame — the counter parse carries the lookalike rejection for both, and
 * the shared timer value pairs the two events downstream.
 */
import { getCV, type Mat, minMaxLoc } from "../../cv";
import {
	type GlyphSet,
	type RecognizedChar,
	recognizeText,
	scaleGlyphSet,
} from "../../glyphs";
import {
	copyRoi,
	maxBrightness,
	maxChannel,
	meanBrightness,
	minChannel,
	type Roi,
} from "../../image";
import { type InkRgb, meanInkColor } from "../../ink-color";
import {
	type BannerScoreRead,
	isBetterRead,
	trailingDigitRun,
} from "../scoreboard/banner";
import type { ScoreboardResources } from "../scoreboard/index";
import type { DetectedEvent, Detector, GateResult } from "../types";
import {
	type PlayerStatusData,
	type PlayerStatusLayout,
	parsePlayerStatus,
} from "./player-status";
import {
	CONTROL_PLATE_MIN_SATURATION,
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
	SCORE_EXTEND_MIN_CONF,
	SCORE_ROIS,
	SCORE_TEXT_HEIGHTS,
	STATUS_LAYOUT_STICKY_MAX_GAP_S,
	STRIP_WEAPON_SAMPLE_INTERVAL,
	TIMER_BIN_THRESHOLD,
	TIMER_DARK_PROBES,
	TIMER_DIGIT_MIN_CONF,
	TIMER_DIGIT_MIN_HEIGHT_RATIO,
	TIMER_DIGIT_ROI,
	TIMER_TEXT_HEIGHTS,
} from "./rois";
import { parseStripWeapons, type StripWeaponsData } from "./strip-weapons";

export type ObjectiveData = SplatZonesObjectiveData;

export interface SplatZonesObjectiveData {
	mode: "SZ";
	/**
	 * seconds shown on the match timer above the plates ("3:35" = 215);
	 * null = unreadable. Counts down in regulation; the overtime display is
	 * unattested so far.
	 */
	time: number | null;
	/** displayed count per team, [alpha, bravo]; null = unreadable */
	score: [number | null, number | null];
	/** penalty pill value per team; null = no pill (or unreadable) */
	penalty: [number | null, number | null];
	/** which team currently holds the zone (team-color plate fill) */
	control: [boolean, boolean];
	/**
	 * mean team-ink RGB per side, sampled off the plate (the team-color
	 * fill while in control, the digit ink otherwise — one of the two is
	 * always drawn in the team's color); null when too little saturated
	 * ink was found. The stable team identity for casted footage, where
	 * the plates follow the specced player's side instead of alpha/bravo.
	 */
	teamColor: [InkRgb | null, InkRgb | null];
}

export const OBJECTIVE_EVENT_TYPE = "Objective";

/** How often the counter is worth checking (it changes at most 1/s). */
const CHECK_INTERVAL_SECONDS = 1;

/**
 * Timeline content guard: consecutive counter reads merge only when they
 * show the same state, so every actual tick/penalty/control change becomes
 * its own event. `time` is deliberately not compared — the timer ticks
 * every second, so comparing it would keep any two reads from ever merging
 * — and neither is `teamColor`, whose raw pixel means jitter per frame.
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
	teamColor: InkRgb | null;
}

export function createObjectiveDetector(
	resources: ScoreboardResources,
): Detector<ObjectiveData | PlayerStatusData | StripWeaponsData> {
	const cv = getCV();
	let lastStatus: { layout: PlayerStatusLayout; t: number } | undefined;
	// primed so the very first counter read samples — short matches and
	// single-frame runs (fixtures) get evidence too
	let readsSinceWeaponSample = STRIP_WEAPON_SAMPLE_INTERVAL;

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
	const timerSets: GlyphSet[] = resources.paintDigits
		? TIMER_TEXT_HEIGHTS.map((h) =>
				scaleGlyphSet(
					resources.paintDigits!,
					h / resources.paintDigits!.height,
				),
			)
		: [];

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
		return meanStd(gray, roi).std <= GATE_PLATE_MAX_STD;
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
					// the band holds nothing but the count, so a leading digit
					// blurred below the extension floor voids the read instead of
					// truncating it (see SCORE_EXTEND_MIN_CONF)
					const read = trailingDigitRun(raw, set, {
						extendMinScore: SCORE_EXTEND_MIN_CONF,
						rejectTruncated: true,
					});
					if (isBetterRead(read, best)) best = read;
				}
			}
			band.delete();
		}
		return best;
	}

	/**
	 * The match timer's M:SS over TIMER_DIGIT_ROI: white digits on the
	 * near-black box the gate already anchored on. The colon's two dots stack
	 * to well under the digit height floor, so a valid read is exactly three
	 * full-height digits — the minute, then the two second digits. Each glyph
	 * size is tried (the digits render bigger on upscaled 720p footage) and
	 * the valid read with the most confident digits wins.
	 */
	function readTimer(gray: Mat): { value: number | null; reading: string } {
		const band = copyRoi(gray, TIMER_DIGIT_ROI);
		let best: { value: number | null; reading: string; score: number } = {
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
	 * saturated team-color style instead of the near-black fill shown while
	 * not in control (see CONTROL_PLATE_MIN_SATURATION in rois.ts).
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

	function parse(
		frame: Mat,
		t: number,
	): DetectedEvent<ObjectiveData | PlayerStatusData | StripWeaponsData>[] {
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
					fill.saturation >= CONTROL_PLATE_MIN_SATURATION,
				fill,
				// the fill while in control, the digit ink otherwise — both
				// ROIs together always cover whichever carries the team color
				teamColor: meanInkColor(frame, [
					SCORE_ROIS[side],
					PLATE_PROBE_ROIS[side],
				]),
			};
		}) as [SideRead, SideRead];
		const timer = readTimer(gray);
		gray.delete();

		// no readable count on either side = the gate hit a lookalike
		if (sides.every((side) => side.score.value === null)) return [];

		const playerStatus = parsePlayerStatus(
			frame,
			t,
			timer.value,
			lastStatus && t - lastStatus.t <= STATUS_LAYOUT_STICKY_MAX_GAP_S
				? lastStatus.layout
				: undefined,
		);
		lastStatus = { layout: playerStatus.data.layout, t };

		// sampled slot-identity evidence for the strip → scoreboard-row
		// assignment; every read would re-measure fixed identities at full
		// template-sweep cost
		let stripWeapons: DetectedEvent<StripWeaponsData> | null = null;
		readsSinceWeaponSample++;
		if (
			resources.stripWeapons &&
			readsSinceWeaponSample >= STRIP_WEAPON_SAMPLE_INTERVAL
		) {
			readsSinceWeaponSample = 0;
			stripWeapons = parseStripWeapons(
				frame,
				t,
				playerStatus.data,
				resources.stripWeapons,
			);
		}

		const confidences = sides.flatMap((side) => [
			...(side.score.value !== null ? [side.score.confidence] : []),
			...(side.penalty?.value != null ? [side.penalty.confidence] : []),
		]);
		return [
			// the icon-strip statuses ride along with every counter read: the
			// count confirmation above is the shared lookalike rejection, and
			// the shared timer value is what pairs the two events downstream
			{
				type: OBJECTIVE_EVENT_TYPE,
				t,
				confidence: confidences.reduce((a, b) => a + b, 0) / confidences.length,
				data: {
					mode: "SZ",
					time: timer.value,
					score: [sides[0].score.value, sides[1].score.value],
					penalty: [
						sides[0].penalty?.value ?? null,
						sides[1].penalty?.value ?? null,
					],
					control: [sides[0].control, sides[1].control],
					teamColor: [sides[0].teamColor, sides[1].teamColor],
				},
				debug: {
					timerReading: timer.reading,
					scoreReadings: sides.map((side) => side.score.reading),
					scoreConfidences: sides.map((side) => side.score.confidence),
					penaltyReadings: sides.map((side) => side.penalty?.reading ?? null),
					plateFills: sides.map((side) => side.fill),
				},
			},
			playerStatus,
			...(stripWeapons ? [stripWeapons] : []),
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
