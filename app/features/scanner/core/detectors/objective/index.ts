/**
 * ObjectiveDetector: parses the ranked counter overlay top-center. Splat Zones
 * and Clam Blitz draw the same count plates, penalty pills, control (the
 * controlling plate keeps its team-color fill, the other is near-black with
 * digits in team ink; in CB the fill means that team's attack window is open)
 * and the M:SS timer. Digits read as the trailing digit run (banner.ts) under several
 * channel extractions (ink on black needs the brightest channel, ink on a team
 * fill the darkest); best read wins. No readable count on either side =
 * lookalike, emits nothing. Tower Control and Rainmaker share a different
 * overlay, a track with the objective riding it (track.ts), which the gate
 * tells apart by the track's dot comb (`variant`). `ObjectiveData` is
 * discriminated on `mode`. Each read also emits a
 * PlayerStatus event (player-status.ts) off the same frame, paired downstream
 * by the shared timer value.
 */
import { type Mat, minMaxLoc } from "../../cv";
import { type GlyphSet, recognizeTextSteps, scaleGlyphSet } from "../../glyphs";
import {
	copyRoi,
	frameGray,
	maxChannel,
	minChannel,
	type Roi,
} from "../../image";
import { type InkRgb, meanInkColor } from "../../ink-color";
import { all, type MatchSteps, runSync } from "../../match-steps";
import {
	type BannerScoreRead,
	isBetterRead,
	trailingDigitRun,
} from "../scoreboard/banner";
import type { ScoreboardResources } from "../scoreboard/index";
import type { DetectedEvent, Detector, GateResult } from "../types";
import {
	type PlayerStatusData,
	parsePlayerStatus,
	type StripFit,
} from "./player-status";
import {
	CONTROL_PLATE_MIN_SATURATION,
	GATE_PLATE_MAX_STD,
	GATE_SCORE_MIN_MAX_BRIGHTNESS,
	GATE_TRACK_MIN_COMB,
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
	STATUS_FIT_STICKY_MAX_GAP_S,
	STRIP_WEAPON_SAMPLE_INTERVAL,
	TRACK_PLATE_TEXT_HEIGHTS,
} from "./rois";
import { parseStripWeapons, type StripWeaponsData } from "./strip-weapons";
import { readMatchTimerSteps, timerBoxChecks, timerGlyphSets } from "./timer";
import { readTrackSteps, trackComb } from "./track";

export type ObjectiveData = ZonesObjectiveData | TrackObjectiveData;

/** Splat Zones / Clam Blitz plates. */
export interface ZonesObjectiveData {
	/** names the plates overlay: CB draws it too, so the match's mode tells the two apart */
	mode: "SZ";
	/** match timer seconds ("3:35" = 215); null = unreadable. Overtime display unattested so far. */
	time: number | null;
	/** displayed count per team, [alpha, bravo]; null = unreadable */
	score: [number | null, number | null];
	/** penalty pill value per team; null = no pill (or unreadable) */
	penalty: [number | null, number | null];
	/**
	 * which team is in control (its plate fills team color: it holds every
	 * zone, or in CB its attack window is open); null = neither
	 */
	control: 0 | 1 | null;
	/**
	 * mean team-ink RGB per side off the plate (fill in control, digit ink
	 * otherwise); null on too little ink. The stable team identity on casted
	 * footage, where plates follow the specced player's side.
	 */
	teamColor: [InkRgb | null, InkRgb | null];
}

/** Tower Control / Rainmaker: one overlay, told apart only by its checkpoint markers. */
export interface TrackObjectiveData {
	/** off the checkpoint markers; null when none read (the match's mode decides) */
	mode: "TC" | "RM" | null;
	/** match timer seconds; null = unreadable */
	time: number | null;
	/**
	 * displayed "Remaining" count per team, [alpha, bravo]; null = no plate
	 * read (a team that never pushed past the middle shows none: 100)
	 */
	score: [number | null, number | null];
	/** which team holds the objective (the icon's ink); null = neutral */
	control: 0 | 1 | null;
	/**
	 * the objective along the track, -100 (left end) .. 100 (right end): the
	 * left team pushes right, so positive is alpha's progress; null = no icon
	 */
	position: number | null;
	/** each team's ink off its own end of the track, for cast orientation */
	teamColor: [InkRgb | null, InkRgb | null];
}

export const OBJECTIVE_EVENT_TYPE = "Objective";

/** Gate variants: which overlay the parse reads. */
const ZONES_VARIANT = "zones";
const TRACK_VARIANT = "track";

/** How often the counter is worth checking (it changes at most 1/s). */
const CHECK_INTERVAL_SECONDS = 1;

/**
 * Timeline content guard: reads merge only with the same state so every tick/
 * penalty/control/position change is its own event. `time` (ticks every
 * second), `teamColor` (pixel means jitter) and a track read's marker `mode`
 * (markers come and go as checkpoints fall) are deliberately not compared.
 */
export function sameObjectiveData(a: unknown, b: unknown): boolean {
	const da = a as ObjectiveData;
	const db = b as ObjectiveData;
	if (
		da.score[0] !== db.score[0] ||
		da.score[1] !== db.score[1] ||
		da.control !== db.control
	) {
		return false;
	}
	if (da.mode === "SZ" || db.mode === "SZ") {
		return (
			da.mode === "SZ" &&
			db.mode === "SZ" &&
			da.penalty[0] === db.penalty[0] &&
			da.penalty[1] === db.penalty[1]
		);
	}
	return da.position === db.position;
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
	let lastStatus: { fit: StripFit; t: number } | undefined;
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
	const trackSets: GlyphSet[] = resources.paintDigits
		? TRACK_PLATE_TEXT_HEIGHTS.map((h) =>
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

	/** The timer box, then the track's dot comb (TC/RM) or the SZ/CB plates. */
	function gate(frame: Mat): GateResult {
		const gray = frameGray(frame);
		const timerChecks = timerBoxChecks(gray);
		if (timerChecks.every(Boolean) && trackComb(frame) >= GATE_TRACK_MIN_COMB) {
			return { pass: true, score: 1, variant: TRACK_VARIANT };
		}
		const checks = [
			...timerChecks,
			plateProbeOk(gray, PLATE_PROBE_ROIS[0]),
			plateProbeOk(gray, PLATE_PROBE_ROIS[1]),
			scoreInkOk(frame, SCORE_ROIS[0]),
			scoreInkOk(frame, SCORE_ROIS[1]),
		];
		const passed = checks.filter(Boolean).length;
		return {
			pass: passed === checks.length,
			score: passed / checks.length,
			variant: ZONES_VARIANT,
		};
	}

	/** Best trailing-digit read across channel extractions, thresholds and glyph sizes; every combination reads in one lockstep. */
	function* readScore(
		frame: Mat,
		gray: Mat,
		roi: Roi,
		speculative: boolean,
	): MatchSteps<BannerScoreRead> {
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
		const reads = bands.flatMap((band) =>
			scoreSets.flatMap((set) =>
				SCORE_BIN_THRESHOLDS.map((binThreshold) => ({
					band,
					set,
					binThreshold,
				})),
			),
		);
		const raws = yield* all(
			reads.map(({ band, set, binThreshold }) =>
				recognizeTextSteps(
					band,
					set,
					{
						binThreshold,
						spaceGap: Number.POSITIVE_INFINITY,
						minCharScore: 0.3,
					},
					speculative,
				),
			),
		);
		for (const [i, { set }] of reads.entries()) {
			// the band holds only the count, so a leading digit under the
			// extension floor voids the read instead of truncating it
			const read = trailingDigitRun(raws[i]!, set, {
				extendMinScore: SCORE_EXTEND_MIN_CONF,
				rejectTruncated: true,
			});
			if (isBetterRead(read, best)) best = read;
		}
		for (const band of bands) band.delete();
		return best;
	}

	/**
	 * Penalty pill: presence probes at the rounded ends first, then the white
	 * "+N" digits. A nameplate badge can cover one end, so a lone pill-like
	 * probe still reads but the digits must be confident on their own.
	 */
	function* readPenalty(
		frame: Mat,
		gray: Mat,
		side: 0 | 1,
		speculative: boolean,
	): MatchSteps<BannerScoreRead | null> {
		if (!penaltySet) return null;
		const pillLikeProbes = PENALTY_PROBE_ROIS[side].filter((roi) => {
			const { mean, std } = meanStd(gray, roi);
			return mean <= PENALTY_PROBE_MAX_MEAN && std <= PENALTY_PROBE_MAX_STD;
		}).length;
		if (pillLikeProbes === 0) return null;
		const band = minChannel(frame, PENALTY_ROIS[side]);
		const raw = yield* recognizeTextSteps(
			band,
			penaltySet,
			{
				binThreshold: PENALTY_BIN_THRESHOLD,
				spaceGap: Number.POSITIVE_INFINITY,
				minCharScore: 0.3,
			},
			speculative,
		);
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

	function* parseSteps(
		frame: Mat,
		t: number,
		gateResult: GateResult | undefined,
		speculative: boolean,
	): MatchSteps<
		DetectedEvent<ObjectiveData | PlayerStatusData | StripWeaponsData>[]
	> {
		const variant = (gateResult ?? gate(frame)).variant;
		const counter =
			variant === TRACK_VARIANT
				? yield* parseTrackSteps(frame, speculative)
				: yield* parseZonesSteps(frame, speculative);
		if (!counter) return [];
		const timeValue = counter.event.data.time;

		const { event: playerStatus, fit } = parsePlayerStatus(
			frame,
			t,
			timeValue,
			lastStatus && t - lastStatus.t <= STATUS_FIT_STICKY_MAX_GAP_S
				? lastStatus.fit
				: undefined,
		);
		lastStatus = { fit, t };

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
				fit,
				resources.stripWeapons,
			);
		}

		return [
			// the strip statuses ride along with every counter read; the shared
			// timer value pairs the two events downstream
			{ ...counter.event, t },
			playerStatus,
			...(stripWeapons ? [stripWeapons] : []),
		];
	}

	/** The SZ/CB plates read; null = no readable count on either side (a lookalike). */
	function* parseZonesSteps(
		frame: Mat,
		speculative: boolean,
	): MatchSteps<{ event: DetectedEvent<ZonesObjectiveData> } | null> {
		const gray = frameGray(frame);

		const [scoreL, scoreR, penaltyL, penaltyR, timer] = yield* all([
			readScore(frame, gray, SCORE_ROIS[0], speculative),
			readScore(frame, gray, SCORE_ROIS[1], speculative),
			readPenalty(frame, gray, 0, speculative),
			readPenalty(frame, gray, 1, speculative),
			readMatchTimerSteps(gray, timerSets, speculative),
		]);
		const reads = [
			{ score: scoreL, penalty: penaltyL },
			{ score: scoreR, penalty: penaltyR },
		];
		const sides = [0 as const, 1 as const].map((side): SideRead => {
			const { score, penalty } = reads[side]!;
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

		if (sides.every((side) => side.score.value === null)) return null;

		const confidences = sides.flatMap((side) => [
			...(side.score.value !== null ? [side.score.confidence] : []),
			...(side.penalty?.value != null ? [side.penalty.confidence] : []),
		]);
		return {
			event: {
				type: OBJECTIVE_EVENT_TYPE,
				t: 0,
				confidence: confidences.reduce((a, b) => a + b, 0) / confidences.length,
				data: {
					mode: "SZ",
					time: timer.value,
					score: [sides[0].score.value, sides[1].score.value],
					penalty: [
						sides[0].penalty?.value ?? null,
						sides[1].penalty?.value ?? null,
					],
					// both plates filled is impossible in-game: a misread, so neither
					control:
						sides[0].control === sides[1].control
							? null
							: sides[0].control
								? 0
								: 1,
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
		};
	}

	/** The TC/RM track read; null = neither the icon nor a plate read (a lookalike). */
	function* parseTrackSteps(
		frame: Mat,
		speculative: boolean,
	): MatchSteps<{ event: DetectedEvent<TrackObjectiveData> } | null> {
		const gray = frameGray(frame);
		const [track, timer] = yield* all([
			readTrackSteps(frame, trackSets, speculative),
			readMatchTimerSteps(gray, timerSets, speculative),
		]);
		const plates = track.score.filter((read) => read.value !== null);
		if (track.position === null && plates.length === 0) return null;

		const confidences = [
			...(track.iconScore !== null ? [track.iconScore] : []),
			...plates.map((read) => read.confidence),
		];
		return {
			event: {
				type: OBJECTIVE_EVENT_TYPE,
				t: 0,
				confidence: confidences.reduce((a, b) => a + b, 0) / confidences.length,
				data: {
					mode: track.mode,
					time: timer.value,
					score: [track.score[0].value, track.score[1].value],
					control: track.holder,
					position: track.position,
					teamColor: track.teamColor,
				},
				debug: {
					timerReading: timer.reading,
					scoreReadings: track.score.map((read) => read.reading),
					scoreConfidences: track.score.map((read) => read.confidence),
					...track.debug,
				},
			},
		};
	}

	return {
		id: "objective",
		checkIntervalS: CHECK_INTERVAL_SECONDS,
		attachFrame: false,
		gate,
		parse: (frame, t, gateResult) =>
			runSync(parseSteps(frame, t, gateResult, false)),
		parseSteps,
	};
}
