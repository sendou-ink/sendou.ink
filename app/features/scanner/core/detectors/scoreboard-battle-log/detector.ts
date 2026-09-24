/**
 * Shared Recent Battles detail parser behind `scoreboard-battle-log` (the
 * full-screen menu) and `quick-scoreboard-battle-log` (the lobby's quick view):
 * the live scoreboard's data plus recording timestamp, no replay code. The
 * panels sit STACKED (winner on top, confirmed by VICTORY/DEFEAT tags) with row
 * text at live sizes, so the scoreboard helpers run with unscaled glyph sets;
 * the header is the replay browser's, parsed with battle log bands. The two
 * screens differ only in geometry, passed in as the detector's rois module; a
 * layout drawn in perspective names the homography that levels it (RECTIFY),
 * and its ROIs then live in the rectified frame.
 */
import {
	CANONICAL_HEIGHT,
	CANONICAL_WIDTH,
	type Roi,
	unionRoi,
} from "../../canonical";
import { getCV, type Mat } from "../../cv";
import { type GlyphSet, recognizeTextSteps, scaleGlyphSet } from "../../glyphs";
import {
	cropRoi,
	frameGray,
	frameRgb,
	maxBrightness,
	maxChannel,
	meanBrightness,
	roiSignature,
	warpPerspective,
} from "../../image";
import { RESULT_TAG_ENTRIES } from "../../localized";
import { all, done, type MatchSteps, runSync } from "../../match-steps";
import { homographyFromQuad, type PerspectiveQuad } from "../../rectify";
import { closestBy } from "../../text";
import {
	type BannerScoreRead,
	FULL_COUNT_TEAM_SCORE,
	parseBannerScoreSteps,
	resolveMatchScores,
} from "../scoreboard/banner";
import { type ParsedNumber, parseNumberSteps } from "../scoreboard/digits";
import type {
	ScoreboardData,
	ScoreboardPlayer,
	ScoreboardResources,
	ScoreboardRowDebug,
} from "../scoreboard/index";
import { findPovIndex } from "../scoreboard/pov";
import { parseScoreboardRowSteps, type RowRois } from "../scoreboard/row";
import { parseReplayHeaderSteps } from "../scoreboard-battle-log-replay/header";
import type { DetectedEvent, Detector, GateResult } from "../types";

export interface ScoreboardBattleLogData extends ScoreboardData {
	/** recording timestamp as shown, e.g. "5/8/2026 19:16"; locale-formatted */
	timestamp: string | null;
}

export type PanelIndex = 0 | 1;

/** One screen's geometry: the shape of a battle log `rois.ts` module. */
export interface BattleLogRois {
	/** levels a layout drawn in perspective; every other member is then in the rectified frame */
	RECTIFY?: PerspectiveQuad;
	/** vertical centers of the 4 player rows within the top panel */
	ROW_CENTERS: readonly number[];
	/** row shift per panel: [top, bottom] */
	PANEL_DYS: readonly [number, number];
	weaponRoi(cy: number): Roi;
	specialIconRoi(cy: number): Roi;
	nameRoi(cy: number): Roi;
	paintRoi(cy: number): Roi;
	paintSuffixRoi(cy: number): Roi;
	statRoi(cy: number, index: 0 | 1 | 2): Roi;
	/** stat digit binarization threshold when the default (150) erodes this layout's digits */
	STAT_BIN_THRESHOLD?: number;
	povArrowRoi(cy: number): Roi;
	teamScoreRoi(panel: PanelIndex): Roi;
	resultTagRoi(panel: PanelIndex): Roi;
	MATCH_SCORE_ROIS: readonly [Roi, Roi];
	HEADER_TOP_BAND: Roi;
	HEADER_BOTTOM_BAND: Roi;
	HEADER_TAG_LEAD_IN_MAX: number;
	HEADER_TAG_COLUMN_FRACTION: number;
	gateDarkProbe(cy: number): Roi;
	GATE_COLOR_PROBES: readonly Roi[];
	GATE_COLOR_MIN_SATURATION: number;
	GATE_DARK_MAX_MEAN: number;
	GATE_TEXT_MIN_MAX: number;
	MATCH_SCORE_DIGIT_HEIGHT: number;
	HEADER_TIMESTAMP_HEIGHT: number;
	HEADER_LINE_HEIGHT: number;
	RESULT_TAG_TEXT_HEIGHT: number;
}

export interface BattleLogLayout {
	id: string;
	eventType: string;
	rois: BattleLogRois;
}

/** White team totals on the color band: a yellow band grays at ~190, digit cores ~250. */
const TEAM_SCORE_BIN_THRESHOLD = 205;

/** Canonical results the localized VICTORY/DEFEAT panel tags snap to. */
type PanelResult = "VICTORY" | "DEFEAT";
const RESULT_MIN_SCORE = 0.6;
/**
 * Tag letters in team ink on the gray stamp (~75, trailing icons ~120): max-channel binarized just
 * above the icons.
 */
const RESULT_TAG_BIN_THRESHOLD = 140;

/** Rows that must pass each pill probe (of the 8) for the gate to fire. */
const GATE_MIN_ROWS = 7;

const FULL_FRAME: Roi = { x: 0, y: 0, w: CANONICAL_WIDTH, h: CANONICAL_HEIGHT };

interface PanelParse {
	players: ScoreboardPlayer[];
	rows: ScoreboardRowDebug[];
	teamScore: ParsedNumber | null;
	result: PanelResult | null;
	resultReading: string;
	resultScore: number;
	confidences: number[];
}

export function createBattleLogDetector(
	resources: ScoreboardResources,
	layout: BattleLogLayout,
): Detector<ScoreboardBattleLogData> {
	const cv = getCV();
	const { rois } = layout;
	const homography = rois.RECTIFY ? homographyFromQuad(rois.RECTIFY) : null;
	const gateRegion = unionRoi([
		...rois.PANEL_DYS.flatMap((dy) =>
			rois.ROW_CENTERS.flatMap((base) => [
				rois.gateDarkProbe(base + dy),
				rois.paintSuffixRoi(base + dy),
			]),
		),
		...rois.GATE_COLOR_PROBES,
	]);

	const scaled = (set: GlyphSet | null, height: number): GlyphSet | null =>
		set ? scaleGlyphSet(set, height / set.height) : null;

	const teamDigits = resources.teamDigits ?? resources.paintDigits;
	const matchScoreSets = teamDigits
		? [
				scaleGlyphSet(
					teamDigits,
					rois.MATCH_SCORE_DIGIT_HEIGHT / teamDigits.height,
				),
			]
		: [];
	/** Timestamp needs digits + '/' + ':' — only the names atlas has them. */
	const headerTopGlyphs = scaled(
		resources.nameGlyphs,
		rois.HEADER_TIMESTAMP_HEIGHT,
	);
	const headerBottomGlyphs = scaled(
		resources.headerLineGlyphs,
		rois.HEADER_LINE_HEIGHT,
	);
	// tags render in FOT-RowdyStd; the BlitzMain fallback reads them only roughly
	const resultGlyphs =
		scaled(resources.replayResultGlyphs ?? null, rois.RESULT_TAG_TEXT_HEIGHT) ??
		scaled(resources.headerLineGlyphs, rois.RESULT_TAG_TEXT_HEIGHT);

	/** Mean-RGB saturation (max minus min channel) of a probe ROI. */
	function probeSaturation(frame: Mat, roi: Roi) {
		const view = cropRoi(frame, roi);
		const cont = new cv.Mat();
		view.copyTo(cont);
		view.delete();
		const d = cont.data;
		const n = cont.rows * cont.cols;
		let r = 0;
		let g = 0;
		let b = 0;
		for (let i = 0; i < n; i++) {
			r += d[i * 4]!;
			g += d[i * 4 + 1]!;
			b += d[i * 4 + 2]!;
		}
		cont.delete();
		if (n === 0) return 0;
		return (Math.max(r, g, b) - Math.min(r, g, b)) / n;
	}

	/**
	 * `frame` as the ROIs see it: itself for a flat layout, else `region` of it
	 * rectified into a region-sized mat, `local` shifting a ROI into it. Its
	 * gray/RGB conversions (the frame's shared ones when flat) live until release.
	 */
	function rectifiedView(frame: Mat, region: Roi) {
		if (!homography) {
			return {
				mat: frame,
				local: (roi: Roi) => roi,
				gray: () => frameGray(frame),
				rgb: () => frameRgb(frame),
				release: () => {},
			};
		}
		const mat = warpPerspective(frame, homography, region);
		const converted: Mat[] = [];
		const convert = (code: number) => {
			const out = new cv.Mat();
			cv.cvtColor(mat, out, code);
			converted.push(out);
			return out;
		};
		return {
			mat,
			local: (roi: Roi): Roi => ({
				...roi,
				x: roi.x - region.x,
				y: roi.y - region.y,
			}),
			gray: () => convert(cv.COLOR_RGBA2GRAY),
			rgb: () => convert(cv.COLOR_RGBA2RGB),
			release: () => {
				mat.delete();
				for (const out of converted) out.delete();
			},
		};
	}

	function gate(frame: Mat): GateResult {
		const probes = rectifiedView(frame, gateRegion);
		const gray = probes.gray();

		let darkOk = 0;
		let suffixOk = 0;
		for (const dy of rois.PANEL_DYS) {
			for (const base of rois.ROW_CENTERS) {
				const cy = base + dy;
				if (
					meanBrightness(probes.mat, probes.local(rois.gateDarkProbe(cy))) <
					rois.GATE_DARK_MAX_MEAN
				)
					darkOk++;
				if (
					maxBrightness(gray, probes.local(rois.paintSuffixRoi(cy))) >
					rois.GATE_TEXT_MIN_MAX
				)
					suffixOk++;
			}
		}
		let colorOk = 0;
		for (const roi of rois.GATE_COLOR_PROBES) {
			if (
				probeSaturation(probes.mat, probes.local(roi)) >=
				rois.GATE_COLOR_MIN_SATURATION
			)
				colorOk++;
		}

		const rowCount = rois.PANEL_DYS.length * rois.ROW_CENTERS.length;
		const score =
			(darkOk / rowCount +
				suffixOk / rowCount +
				colorOk / rois.GATE_COLOR_PROBES.length) /
			3;
		const pass =
			darkOk >= GATE_MIN_ROWS &&
			suffixOk >= GATE_MIN_ROWS &&
			colorOk === rois.GATE_COLOR_PROBES.length;
		// browsing between entries never drops this gate, so fingerprint what
		// differs between battles (timestamp, stage, names) for the scheduler
		let signature: number[] | undefined;
		if (pass && homography) {
			const flat = rectifiedView(frame, FULL_FRAME);
			signature = contentSignature(flat.gray());
			flat.release();
		} else if (pass) {
			signature = contentSignature(gray);
		}
		probes.release();
		return { pass, score, signature };
	}

	function contentSignature(gray: Mat): number[] {
		const signature = roiSignature(gray, rois.HEADER_TOP_BAND, 32, 2);
		for (const dy of rois.PANEL_DYS) {
			for (const base of rois.ROW_CENTERS) {
				signature.push(...roiSignature(gray, rois.nameRoi(base + dy), 8, 1));
			}
		}
		return signature;
	}

	/** One panel's rows, team total and result tag, all read in one lockstep. */
	function* parsePanelSteps(
		gray: Mat,
		rgb: Mat,
		panel: PanelIndex,
		speculative: boolean,
	): MatchSteps<PanelParse> {
		const rowRois: RowRois = {
			weapon: rois.weaponRoi,
			specialIcon: rois.specialIconRoi,
			paint: rois.paintRoi,
			name: rois.nameRoi,
			stat: rois.statRoi,
			povArrow: rois.povArrowRoi,
		};
		const dy = rois.PANEL_DYS[panel];
		// the point total is read only to recognize a knockout (only a knockout's
		// full count reaches 500); never emitted as a score
		const teamCrop = teamDigits
			? cropRoi(gray, rois.teamScoreRoi(panel))
			: null;
		const bright = resultGlyphs
			? maxChannel(rgb, rois.resultTagRoi(panel))
			: null;
		const [rowReads, teamScore, resultRaw] = yield* all([
			all(
				rois.ROW_CENTERS.map((base) =>
					parseScoreboardRowSteps(
						gray,
						rgb,
						base + dy,
						rowRois,
						resources,
						{ statBinThreshold: rois.STAT_BIN_THRESHOLD },
						speculative,
					),
				),
			),
			teamDigits && teamCrop
				? parseNumberSteps(
						teamCrop,
						teamDigits,
						{ binThreshold: TEAM_SCORE_BIN_THRESHOLD },
						speculative,
					)
				: done(null),
			resultGlyphs && bright
				? recognizeTextSteps(
						bright,
						resultGlyphs,
						{
							binThreshold: RESULT_TAG_BIN_THRESHOLD,
							spaceGap: Number.POSITIVE_INFINITY,
							minCharScore: 0.25,
						},
						speculative,
					)
				: done(null),
		]);
		teamCrop?.delete();
		bright?.delete();

		const confidences = rowReads.flatMap((row) => row.confidences);
		if (teamScore) confidences.push(teamScore.confidence);

		let result: PanelParse["result"] = null;
		let resultReading = "";
		let resultScore = 0;
		if (resultRaw) {
			resultReading = resultRaw.text;
			if (resultReading) {
				const match = closestBy(
					resultReading,
					RESULT_TAG_ENTRIES,
					(e) => e.text,
				);
				if (match) {
					resultScore = match.score;
					if (match.score >= RESULT_MIN_SCORE)
						result = match.entry.canonical as PanelResult;
				}
			}
		}

		return {
			players: rowReads.map((row) => row.player),
			rows: rowReads.map((row) => row.debug),
			teamScore,
			result,
			resultReading,
			resultScore,
			confidences,
		};
	}

	function* parseSteps(
		frame: Mat,
		t: number,
		_gate: GateResult | undefined,
		speculative: boolean,
	): MatchSteps<DetectedEvent<ScoreboardBattleLogData>[]> {
		const flat = rectifiedView(frame, FULL_FRAME);
		const gray = flat.gray();
		const rgb = flat.rgb();

		const [top, bottom, banners, header] = yield* all([
			parsePanelSteps(gray, rgb, 0, speculative),
			parsePanelSteps(gray, rgb, 1, speculative),
			matchScoreSets.length > 0
				? all([
						parseBannerScoreSteps(
							gray,
							rois.MATCH_SCORE_ROIS[0],
							matchScoreSets,
							speculative,
						),
						parseBannerScoreSteps(
							gray,
							rois.MATCH_SCORE_ROIS[1],
							matchScoreSets,
							speculative,
						),
					])
				: done(null),
			headerTopGlyphs && headerBottomGlyphs
				? parseReplayHeaderSteps(
						gray,
						headerTopGlyphs,
						headerBottomGlyphs,
						{
							top: rois.HEADER_TOP_BAND,
							bottom: rois.HEADER_BOTTOM_BAND,
							tagLeadInMax: rois.HEADER_TAG_LEAD_IN_MAX,
							tagColumnFraction: rois.HEADER_TAG_COLUMN_FRACTION,
						},
						speculative,
					)
				: done(null),
		]);
		const [left, right]: [BannerScoreRead | null, BannerScoreRead | null] =
			banners ?? [null, null];

		const swapped = decideSwapped(top, bottom, left, right);
		const [winner, loser] = swapped ? [bottom, top] : [top, bottom];
		// POV arrow row, indexed into the winners-first players ordering
		const povIndex = findPovIndex(
			[...winner.rows, ...loser.rows].map((r) => r.povFraction),
		);

		const knockout = winner.teamScore?.value === FULL_COUNT_TEAM_SCORE;
		let matchScores: [number | null, number | null] = [null, null];
		let bannerDebug: object | undefined;
		if (left && right) {
			matchScores = resolveMatchScores({ left, right, knockout });
			winner.confidences.push(left.confidence, right.confidence);
			bannerDebug = { left, right, knockout };
		}

		flat.release();

		const confidences = [
			...winner.confidences,
			...loser.confidences,
			...(header ? [header.confidence] : []),
		];
		const confidence =
			confidences.length > 0
				? confidences.reduce((a, b) => a + b, 0) / confidences.length
				: 0;

		return [
			{
				type: layout.eventType,
				t,
				confidence,
				data: {
					lobby: header?.lobby ?? null,
					mode: header?.mode ?? null,
					stage: header?.stage ?? null,
					timestamp: header?.timestamp ?? null,
					matchScores,
					players: [...winner.players, ...loser.players],
					povIndex,
				},
				debug: {
					rows: [...winner.rows, ...loser.rows],
					teamScoreConf: [
						winner.teamScore?.confidence ?? 0,
						loser.teamScore?.confidence ?? 0,
					],
					matchScore: bannerDebug,
					header: header?.debug,
					winnerSide: swapped ? "bottom" : "top",
					resultTags: {
						top: {
							reading: top.resultReading,
							score: top.resultScore,
							result: top.result,
						},
						bottom: {
							reading: bottom.resultReading,
							score: bottom.resultScore,
							result: bottom.result,
						},
					},
				},
			},
		];
	}

	// no rearm cooldown: browsed battles are told apart by the gate signature and
	// the timeline merges via sameScoreboardMatch
	return {
		id: layout.id,
		sufficientConfidence: 0.8,
		gate,
		parse: (frame, t, gateResult) =>
			runSync(parseSteps(frame, t, gateResult, false)),
		parseSteps,
	};
}

/**
 * Whether the winner sits in the bottom panel: a confident VICTORY/DEFEAT tag
 * (the distressed texture usually reads under the floor), else panel totals
 * (count x5; only a knockout reaches 500) against the banner. Default top.
 */
function decideSwapped(
	top: PanelParse,
	bottom: PanelParse,
	left: BannerScoreRead | null,
	right: BannerScoreRead | null,
): boolean {
	if (top.result !== null || bottom.result !== null) {
		return top.result === "DEFEAT" || bottom.result === "VICTORY";
	}
	const topTotal = top.teamScore?.value ?? null;
	const bottomTotal = bottom.teamScore?.value ?? null;
	if (topTotal === FULL_COUNT_TEAM_SCORE) return false;
	if (bottomTotal === FULL_COUNT_TEAM_SCORE) return true;
	if (
		left?.value != null &&
		right?.value != null &&
		topTotal !== null &&
		bottomTotal !== null &&
		topTotal !== bottomTotal
	) {
		const hi = Math.max(left.value, right.value) * 5;
		const lo = Math.min(left.value, right.value) * 5;
		if (topTotal === lo && bottomTotal === hi) return true;
	}
	return false;
}
