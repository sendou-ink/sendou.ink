/**
 * ScoreboardBattleLogReplayDetector: parses the replay-browser detail screen —
 * the live scoreboard's data plus recording timestamp and replay code. The two
 * team panels sit side by side with the owner's team on either side, so the
 * VICTORY/DEFEAT tags keep `players`/`matchScores` winners-first. Reuses the
 * scoreboard helpers with glyph sets rescaled to this screen.
 */
import { getCV, type Mat } from "../../cv";
import { type GlyphSet, recognizeTextSteps, scaleGlyphSet } from "../../glyphs";
import {
	cropRoi,
	frameGray,
	frameRgb,
	maxBrightness,
	maxChannel,
	meanBrightness,
	type Roi,
	roiSignature,
} from "../../image";
import { RESULT_TAG_ENTRIES } from "../../localized";
import { all, done, type MatchSteps, runSync } from "../../match-steps";
import { closestBy } from "../../text";
import {
	FULL_COUNT_TEAM_SCORE,
	KO_MATCH_SCORE,
	MATCH_SCORE_MIN_CONF,
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
import type { DetectedEvent, Detector, GateResult } from "../types";
import { codeCharsetOf, parseReplayCodeSteps } from "./code";
import { parseReplayHeaderSteps } from "./header";
import {
	CODE_TEXT_HEIGHT,
	GATE_CODE_BLUE_MAX,
	GATE_CODE_GREEN_MIN,
	GATE_CODE_MIN_FRACTION,
	GATE_FLAT_MAX_MEAN,
	GATE_FLAT_MIN_MEAN,
	GATE_GAP_MAX_MEAN,
	GATE_GAP_PROBES,
	GATE_TEXT_MIN_MAX,
	gateFlatProbe,
	HEADER_LINE_HEIGHT,
	HEADER_TIMESTAMP_HEIGHT,
	HEADER_TOP_BAND,
	MATCH_SCORE_DIGIT_HEIGHT,
	MATCH_SCORE_ROIS,
	NAME_TEXT_HEIGHT,
	nameRoi,
	PAINT_DIGIT_HEIGHT,
	PANEL_XS,
	paintRoi,
	paintSuffixRoi,
	povArrowRoi,
	REPLAY_CODE_ROI,
	RESULT_TAG_TEXT_HEIGHT,
	ROW_CENTERS,
	resultTagRoi,
	STAT_DIGIT_HEIGHT,
	specialIconRoi,
	statRoi,
	TEAM_DIGIT_HEIGHT,
	teamScoreRoi,
	weaponRoi,
} from "./rois";

export interface ScoreboardBattleLogReplayData extends ScoreboardData {
	/** recording timestamp as shown, e.g. "3/7/2026 22:28"; locale-formatted */
	timestamp: string | null;
	/** "XXXX-XXXX-XXXX-XXXX" */
	replayCode: string | null;
}

export const SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE =
	"ScoreboardBattleLogReplay";

/** Replay pills are mid-gray (~61), not near-black; see matchWeapon docs. */
const REPLAY_INK_THRESHOLD = 90;

/**
 * White digits on team color ("Score:" banners and team totals): a green DEFEAT panel reads ~184
 * gray, above the default 150.
 */
const BANNER_BIN_THRESHOLD = 190;

/** Canonical results the localized VICTORY/DEFEAT panel tags snap to. */
type PanelResult = "VICTORY" | "DEFEAT";
const RESULT_MIN_SCORE = 0.6;
/** Outlined tag letters bridge at 150 on max-channel; 190 keeps cores separated and drops trailing gray icons. */
const RESULT_TAG_BIN_THRESHOLD = 190;

interface PanelParse {
	players: ScoreboardPlayer[];
	rows: ScoreboardRowDebug[];
	teamScore: ParsedNumber | null;
	matchScore: ParsedNumber | null;
	result: PanelResult | null;
	resultReading: string;
	resultScore: number;
	confidences: number[];
}

/** Fraction of ROI pixels matching the replay code's green (RGBA frame). */
function greenFraction(frame: Mat, roi: Roi): number {
	const cv = getCV();
	const view = cropRoi(frame, roi);
	const cont = new cv.Mat();
	view.copyTo(cont);
	view.delete();
	const d = cont.data;
	const n = cont.rows * cont.cols;
	let green = 0;
	for (let i = 0; i < n; i++) {
		if (
			d[i * 4 + 1]! > GATE_CODE_GREEN_MIN &&
			d[i * 4 + 2]! < GATE_CODE_BLUE_MAX
		)
			green++;
	}
	cont.delete();
	return n > 0 ? green / n : 0;
}

export function createScoreboardBattleLogReplayDetector(
	resources: ScoreboardResources,
): Detector<ScoreboardBattleLogReplayData> {
	const scaled = (set: GlyphSet | null, height: number): GlyphSet | null =>
		set ? scaleGlyphSet(set, height / set.height) : null;

	const nameGlyphs = scaled(resources.nameGlyphs, NAME_TEXT_HEIGHT);
	const paintDigits = scaled(resources.paintDigits, PAINT_DIGIT_HEIGHT);
	const statDigits = scaled(resources.statDigits, STAT_DIGIT_HEIGHT);
	const teamBase = resources.teamDigits ?? resources.paintDigits;
	const teamDigits = scaled(teamBase, TEAM_DIGIT_HEIGHT);
	const matchScoreDigits = scaled(teamBase, MATCH_SCORE_DIGIT_HEIGHT);
	/** Timestamp needs digits + '/' + ':' — only the names atlas has them. */
	const headerTopGlyphs = scaled(resources.nameGlyphs, HEADER_TIMESTAMP_HEIGHT);
	const headerBottomGlyphs = scaled(
		resources.headerLineGlyphs,
		HEADER_LINE_HEIGHT,
	);
	// code and result tags render in FOT-RowdyStd; the BlitzMain fallbacks read them only roughly
	const resultGlyphs =
		scaled(resources.replayResultGlyphs ?? null, RESULT_TAG_TEXT_HEIGHT) ??
		scaled(resources.headerLineGlyphs, RESULT_TAG_TEXT_HEIGHT);
	const codeGlyphs = resources.replayCodeGlyphs
		? scaled(resources.replayCodeGlyphs, CODE_TEXT_HEIGHT)
		: resources.nameGlyphs
			? scaleGlyphSet(
					codeCharsetOf(resources.nameGlyphs),
					CODE_TEXT_HEIGHT / resources.nameGlyphs.height,
				)
			: null;

	function gate(frame: Mat): GateResult {
		const gray = frameGray(frame);

		let flatOk = 0;
		let suffixOk = 0;
		for (const dx of PANEL_XS) {
			for (const cy of ROW_CENTERS) {
				const flat = meanBrightness(frame, gateFlatProbe(cy, dx));
				if (flat >= GATE_FLAT_MIN_MEAN && flat <= GATE_FLAT_MAX_MEAN) flatOk++;
				if (maxBrightness(gray, paintSuffixRoi(cy, dx)) > GATE_TEXT_MIN_MAX)
					suffixOk++;
			}
		}
		let gapOk = 0;
		for (const roi of GATE_GAP_PROBES) {
			if (meanBrightness(frame, roi) < GATE_GAP_MAX_MEAN) gapOk++;
		}
		const codeFraction = greenFraction(frame, REPLAY_CODE_ROI);

		const rowCount = PANEL_XS.length * ROW_CENTERS.length;
		const score =
			(flatOk / rowCount +
				suffixOk / rowCount +
				gapOk / GATE_GAP_PROBES.length +
				Math.min(1, codeFraction / (2 * GATE_CODE_MIN_FRACTION))) /
			4;
		const pass =
			flatOk >= 7 &&
			suffixOk >= 7 &&
			gapOk === 2 &&
			codeFraction >= GATE_CODE_MIN_FRACTION;
		// browsing between replays never drops this gate, so fingerprint what
		// differs between battles (timestamp, code, names) for the scheduler
		const signature = pass ? contentSignature(gray) : undefined;
		return { pass, score, signature };
	}

	function contentSignature(gray: Mat): number[] {
		const signature = roiSignature(gray, HEADER_TOP_BAND, 32, 2);
		signature.push(...roiSignature(gray, REPLAY_CODE_ROI, 32, 1));
		for (const dx of PANEL_XS) {
			for (const cy of ROW_CENTERS) {
				signature.push(...roiSignature(gray, nameRoi(cy, dx), 8, 1));
			}
		}
		return signature;
	}

	/** One panel's rows, totals and result tag, all read in one lockstep. */
	function* parsePanelSteps(
		gray: Mat,
		rgb: Mat,
		dx: number,
		speculative: boolean,
	): MatchSteps<PanelParse> {
		const rowRois: RowRois = {
			weapon: (cy) => weaponRoi(cy, dx),
			specialIcon: (cy) => specialIconRoi(cy, dx),
			paint: (cy) => paintRoi(cy, dx),
			name: (cy) => nameRoi(cy, dx),
			stat: (cy, i) => statRoi(cy, dx, i),
			povArrow: (cy) => povArrowRoi(cy, dx),
		};
		const rowResources = {
			weapons: resources.weapons,
			specials: resources.specials,
			paintDigits,
			statDigits,
			nameGlyphs,
		};
		// a short team (7-player private battle) renders no pill for the unused
		// bottom row (gate's flatOk >= 7 tolerates it); skip it, no phantom player
		const rowCenters = ROW_CENTERS.filter((cy) => {
			const flat = meanBrightness(rgb, gateFlatProbe(cy, dx));
			return flat >= GATE_FLAT_MIN_MEAN && flat <= GATE_FLAT_MAX_MEAN;
		});
		// the point total is read only to recognize a knockout below (only a
		// knockout's full count reaches 500); never emitted as a score
		const teamCrop = teamDigits ? cropRoi(gray, teamScoreRoi(dx)) : null;
		const matchCrop = matchScoreDigits
			? cropRoi(gray, MATCH_SCORE_ROIS[dx === 0 ? 0 : 1]!)
			: null;
		const bright = resultGlyphs ? maxChannel(rgb, resultTagRoi(dx)) : null;
		const [rowReads, teamScore, matchRead, resultRaw] = yield* all([
			all(
				rowCenters.map((cy) =>
					// paint is left-aligned so the "p" suffix lands inside the ROI on short paints
					parseScoreboardRowSteps(
						gray,
						rgb,
						cy,
						rowRois,
						rowResources,
						{
							weaponInkThreshold: REPLAY_INK_THRESHOLD,
							paintDropLoweredTrailing: true,
						},
						speculative,
					),
				),
			),
			teamDigits && teamCrop
				? parseNumberSteps(
						teamCrop,
						teamDigits,
						{ binThreshold: BANNER_BIN_THRESHOLD },
						speculative,
					)
				: done(null),
			matchScoreDigits && matchCrop
				? parseNumberSteps(
						matchCrop,
						matchScoreDigits,
						{ binThreshold: BANNER_BIN_THRESHOLD },
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
		matchCrop?.delete();
		bright?.delete();

		const confidences = rowReads.flatMap((row) => row.confidences);
		if (teamScore) confidences.push(teamScore.confidence);

		let matchScore: ParsedNumber | null = matchRead;
		if (matchScore) {
			if (
				matchScore.confidence < MATCH_SCORE_MIN_CONF ||
				(matchScore.value !== null && matchScore.value > KO_MATCH_SCORE)
			) {
				matchScore = { ...matchScore, value: null };
			}
			confidences.push(matchScore.confidence);
			// no number + a full team count = the KNOCKOUT! burst sits where the score
			// would be; an unreadable banner on a lesser total stays null
			if (
				matchScore.value === null &&
				teamScore?.value === FULL_COUNT_TEAM_SCORE
			) {
				matchScore = { ...matchScore, value: KO_MATCH_SCORE };
			}
		}

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
			matchScore,
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
	): MatchSteps<DetectedEvent<ScoreboardBattleLogReplayData>[]> {
		const gray = frameGray(frame);
		const rgb = frameRgb(frame);

		const [left, right, header, code] = yield* all([
			parsePanelSteps(gray, rgb, PANEL_XS[0]!, speculative),
			parsePanelSteps(gray, rgb, PANEL_XS[1]!, speculative),
			headerTopGlyphs && headerBottomGlyphs
				? parseReplayHeaderSteps(
						gray,
						headerTopGlyphs,
						headerBottomGlyphs,
						undefined,
						speculative,
					)
				: done(null),
			codeGlyphs
				? parseReplayCodeSteps(rgb, codeGlyphs, speculative)
				: done(null),
		]);

		// winners first: confident VICTORY/DEFEAT tag, else the higher "Score:"
		// banner, else left
		let swapped = false;
		if (left.result !== null || right.result !== null) {
			swapped = left.result === "DEFEAT" || right.result === "VICTORY";
		} else if (
			left.matchScore?.value != null &&
			right.matchScore?.value != null
		) {
			swapped = right.matchScore.value > left.matchScore.value;
		}
		const [winner, loser] = swapped ? [right, left] : [left, right];
		// POV arrow row, indexed into the winners-first players ordering
		const povIndex = findPovIndex(
			[...winner.rows, ...loser.rows].map((r) => r.povFraction),
		);

		const confidences = [
			...winner.confidences,
			...loser.confidences,
			...(header ? [header.confidence] : []),
			...(code ? [code.confidence] : []),
		];
		const confidence =
			confidences.length > 0
				? confidences.reduce((a, b) => a + b, 0) / confidences.length
				: 0;

		return [
			{
				type: SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE,
				t,
				confidence,
				data: {
					lobby: header?.lobby ?? null,
					mode: header?.mode ?? null,
					stage: header?.stage ?? null,
					timestamp: header?.timestamp ?? null,
					replayCode: code?.code ?? null,
					matchScores: [
						winner.matchScore?.value ?? null,
						loser.matchScore?.value ?? null,
					],
					players: [...winner.players, ...loser.players],
					povIndex,
				},
				debug: {
					rows: [...winner.rows, ...loser.rows],
					teamScoreConf: [
						winner.teamScore?.confidence ?? 0,
						loser.teamScore?.confidence ?? 0,
					],
					matchScoreConf: [
						winner.matchScore?.confidence ?? 0,
						loser.matchScore?.confidence ?? 0,
					],
					header: header?.debug,
					codeRaw: code?.raw.text,
					winnerSide: swapped ? "right" : "left",
					resultTags: {
						left: {
							reading: left.resultReading,
							score: left.resultScore,
							result: left.result,
						},
						right: {
							reading: right.resultReading,
							score: right.resultScore,
							result: right.result,
						},
					},
				},
			},
		];
	}

	// no rearm cooldown: browsed replays are told apart by content signature.
	// sufficientConfidence just under the clean-read floor (fixtures 0.808-0.890)
	return {
		id: "scoreboard-battle-log-replay",
		sufficientConfidence: 0.8,
		gate,
		parse: (frame, t, gateResult) =>
			runSync(parseSteps(frame, t, gateResult, false)),
		parseSteps,
	};
}
