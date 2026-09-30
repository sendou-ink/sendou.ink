/**
 * ObjectiveDetector: parses the ranked counter overlay top-center — count plates,
 * penalty pills, control (the controlling plate keeps its team-color fill, the
 * other is near-black with digits in team ink) and the M:SS timer. Digits read
 * as the trailing digit run (banner.ts) under several channel extractions (ink
 * on black needs the brightest channel, ink on a team fill the darkest); best
 * read wins. No readable count on either side = lookalike, emits nothing.
 * `ObjectiveData` is discriminated on `mode`; only SZ exists until TC/RM/CB
 * fixtures. Each read also emits a PlayerStatus event (player-status.ts) off
 * the same frame, paired downstream by the shared timer value.
 */
import { getCV, type Mat, minMaxLoc } from "../../cv";
import { type GlyphSet, recognizeText, scaleGlyphSet } from "../../glyphs";
import { copyRoi, maxChannel, minChannel, type Roi } from "../../image";
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
	PENALTY_BIN_THRESHOLD,
	PENALTY_PROBE_MAX_MEAN,
	PENALTY_PROBE_MAX_STD,
	PENALTY_PROBE_ROIS,
	PENALTY_ROIS,
	PENALTY_SINGLE_PROBE_MIN_CONF,
	PENALTY_TEXT_HEIGHT,
	PLATE_PROBE_ROIS,
	SCORE_BIN_THRESHOLDS,
	SCORE_EXTEND_MIN_CONF,
	SCORE_ROIS,
	SCORE_TEXT_HEIGHTS,
	STATUS_LAYOUT_STICKY_MAX_GAP_S,
	STRIP_WEAPON_SAMPLE_INTERVAL,
} from "./rois";
import { parseStripWeapons, type StripWeaponsData } from "./strip-weapons";
import { readMatchTimer, timerBoxChecks, timerGlyphSets } from "./timer";

export type ObjectiveData = SplatZonesObjectiveData;

export interface SplatZonesObjectiveData {
	mode: "SZ";
	/** match timer seconds ("3:35" = 215); null = unreadable. Overtime display unattested so far. */
	time: number | null;
	/** displayed count per team, [alpha, bravo]; null = unreadable */
	score: [number | null, number | null];
	/** penalty pill value per team; null = no pill (or unreadable) */
	penalty: [number | null, number | null];
	/** which team currently holds the zone (team-color plate fill) */
	control: [boolean, boolean];
	/**
	 * mean team-ink RGB per side off the plate (fill in control, digit ink
	 * otherwise); null on too little ink. The stable team identity on casted
	 * footage, where plates follow the specced player's side.
	 */
	teamColor: [InkRgb | null, InkRgb | null];
}

export const OBJECTIVE_EVENT_TYPE = "Objective";

/** How often the counter is worth checking (it changes at most 1/s). */
const CHECK_INTERVAL_SECONDS = 1;

/**
 * Timeline content guard: reads merge only with the same state so every tick/
 * penalty/control change is its own event. `time` (ticks every second) and
 * `teamColor` (pixel means jitter) are deliberately not compared.
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
	// primed so the very first read samples (short matches, single-frame fixtures)
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
	const timerSets = timerGlyphSets(resources);

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
			...timerBoxChecks(gray),
			plateProbeOk(gray, PLATE_PROBE_ROIS[0]),
			plateProbeOk(gray, PLATE_PROBE_ROIS[1]),
			scoreInkOk(frame, SCORE_ROIS[0]),
			scoreInkOk(frame, SCORE_ROIS[1]),
		];
		gray.delete();
		const passed = checks.filter(Boolean).length;
		return { pass: passed === checks.length, score: passed / checks.length };
	}

	/** Best trailing-digit read across channel extractions, thresholds and glyph sizes. */
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
					// the band holds only the count, so a leading digit under the
					// extension floor voids the read instead of truncating it
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
	 * Penalty pill: presence probes at the rounded ends first, then the white
	 * "+N" digits. A nameplate badge can cover one end, so a lone pill-like
	 * probe still reads but the digits must be confident on their own.
	 */
	function readPenalty(
		frame: Mat,
		gray: Mat,
		side: 0 | 1,
	): BannerScoreRead | null {
		if (!penaltySet) return null;
		const pillLikeProbes = PENALTY_PROBE_ROIS[side].filter((roi) => {
			const { mean, std } = meanStd(gray, roi);
			return mean <= PENALTY_PROBE_MAX_MEAN && std <= PENALTY_PROBE_MAX_STD;
		}).length;
		if (pillLikeProbes === 0) return null;
		const band = minChannel(frame, PENALTY_ROIS[side]);
		const raw = recognizeText(band, penaltySet, {
			binThreshold: PENALTY_BIN_THRESHOLD,
			spaceGap: Number.POSITIVE_INFINITY,
			minCharScore: 0.3,
		});
		band.delete();
		const read = trailingDigitRun(raw, penaltySet);
		if (
			pillLikeProbes < PENALTY_PROBE_ROIS[side].length &&
			read.confidence < PENALTY_SINGLE_PROBE_MIN_CONF
		) {
			return null;
		}
		return read;
	}

	/** Plate fill over the probe strip; saturated = team-color style = in control (CONTROL_PLATE_MIN_SATURATION). */
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
				// both ROIs together always cover whichever carries the team color
				teamColor: meanInkColor(frame, [
					SCORE_ROIS[side],
					PLATE_PROBE_ROIS[side],
				]),
			};
		}) as [SideRead, SideRead];
		const timer = readMatchTimer(gray, timerSets);
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

		// sampled slot-identity evidence for the strip → scoreboard-row assignment;
		// identities are fixed so every read would re-measure at full sweep cost
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
			// the strip statuses ride along with every counter read; the shared
			// timer value pairs the two events downstream
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
