/**
 * ScoreboardBattleLogReplayDetector: parses the replay-browser detail screen —
 * the live scoreboard's data plus recording timestamp and replay code. The two
 * team panels sit side by side with the owner's team on either side, so the
 * VICTORY/DEFEAT tags keep `players`/`matchScores` winners-first. Reuses the
 * scoreboard helpers with glyph sets rescaled to this screen.
 */
import { getCV, type Mat } from "../../cv";
import { type GlyphSet, recognizeText, scaleGlyphSet } from "../../glyphs";
import {
	cropRoi,
	maxBrightness,
	maxChannel,
	meanBrightness,
	type Roi,
	roiSignature,
} from "../../image";
import { RESULT_TAG_ENTRIES } from "../../localized";
import { closestBy } from "../../text";
import {
	FULL_COUNT_TEAM_SCORE,
	KO_MATCH_SCORE,
	MATCH_SCORE_MIN_CONF,
} from "../scoreboard/banner";
import { type ParsedNumber, parseNumber } from "../scoreboard/digits";
import type {
	ScoreboardData,
	ScoreboardPlayer,
	ScoreboardResources,
	ScoreboardRowDebug,
} from "../scoreboard/index";
import { findPovIndex } from "../scoreboard/pov";
import { parseScoreboardRow, type RowRois } from "../scoreboard/row";
import type { DetectedEvent, Detector, GateResult } from "../types";
import { codeCharsetOf, type ParsedReplayCode, parseReplayCode } from "./code";
import { type ParsedReplayHeader, parseReplayHeader } from "./header";
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
	const cv = getCV();

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
		const gray = new cv.Mat();
		cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);

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
		gray.delete();
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

	function parsePanel(gray: Mat, rgb: Mat, dx: number): PanelParse {
		const players: ScoreboardPlayer[] = [];
		const rows: ScoreboardRowDebug[] = [];
		const confidences: number[] = [];

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
		for (const cy of ROW_CENTERS) {
			// a short team (7-player private battle) renders no pill for the unused
			// bottom row (gate's flatOk >= 7 tolerates it); skip it, no phantom player
			const flat = meanBrightness(rgb, gateFlatProbe(cy, dx));
			if (flat < GATE_FLAT_MIN_MEAN || flat > GATE_FLAT_MAX_MEAN) continue;

			// paint is left-aligned so the "p" suffix lands inside the ROI on short paints
			const row = parseScoreboardRow(
				gray,
				rgb,
				cy,
				rowRois,
				rowResources,
				confidences,
				{
					weaponInkThreshold: REPLAY_INK_THRESHOLD,
					paintDropLoweredTrailing: true,
				},
			);
			players.push(row.player);
			rows.push(row.debug);
		}

		// the point total is read only to recognize a knockout below (only a
		// knockout's full count reaches 500); never emitted as a score
		let teamScore: ParsedNumber | null = null;
		if (teamDigits) {
			const crop = cropRoi(gray, teamScoreRoi(dx));
			teamScore = parseNumber(crop, teamDigits, {
				binThreshold: BANNER_BIN_THRESHOLD,
			});
			crop.delete();
			confidences.push(teamScore.confidence);
		}

		let matchScore: ParsedNumber | null = null;
		if (matchScoreDigits) {
			const crop = cropRoi(gray, MATCH_SCORE_ROIS[dx === 0 ? 0 : 1]!);
			matchScore = parseNumber(crop, matchScoreDigits, {
				binThreshold: BANNER_BIN_THRESHOLD,
			});
			if (
				matchScore.confidence < MATCH_SCORE_MIN_CONF ||
				(matchScore.value !== null && matchScore.value > KO_MATCH_SCORE)
			) {
				matchScore = { ...matchScore, value: null };
			}
			crop.delete();
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
		if (resultGlyphs) {
			const bright = maxChannel(rgb, resultTagRoi(dx));
			const raw = recognizeText(bright, resultGlyphs, {
				binThreshold: RESULT_TAG_BIN_THRESHOLD,
				spaceGap: Number.POSITIVE_INFINITY,
				minCharScore: 0.25,
			});
			bright.delete();
			resultReading = raw.text;
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
			players,
			rows,
			teamScore,
			matchScore,
			result,
			resultReading,
			resultScore,
			confidences,
		};
	}

	function parse(
		frame: Mat,
		t: number,
	): DetectedEvent<ScoreboardBattleLogReplayData>[] {
		const gray = new cv.Mat();
		cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
		const rgb = new cv.Mat();
		cv.cvtColor(frame, rgb, cv.COLOR_RGBA2RGB);

		const [left, right] = PANEL_XS.map((dx) => parsePanel(gray, rgb, dx)) as [
			PanelParse,
			PanelParse,
		];

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

		let header: ParsedReplayHeader | null = null;
		if (headerTopGlyphs && headerBottomGlyphs) {
			header = parseReplayHeader(gray, headerTopGlyphs, headerBottomGlyphs);
		}

		let code: ParsedReplayCode | null = null;
		if (codeGlyphs) {
			code = parseReplayCode(rgb, codeGlyphs);
		}

		gray.delete();
		rgb.delete();

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
		parse,
	};
}
